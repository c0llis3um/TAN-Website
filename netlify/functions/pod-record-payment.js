/**
 * Netlify Function: pod-record-payment
 *
 * POST /.netlify/functions/pod-record-payment
 * Body: { podId: string, walletAddress: string }
 *
 * Server-verified cycle contribution — the only way `payments` rows are written
 * now that anon/authenticated write grants on that table have been revoked (see
 * supabase/migrations/028_lock_fund_moving_tables.sql). Verifies a real,
 * validated on-chain payment to this cycle's payout recipient exists before
 * recording anything, folding in what used to be client-side recordPayment() +
 * maybeAdvanceCycle() (src/lib/db.js).
 *
 * Verification scans walletAddress's own recent payment history for a
 * qualifying payment rather than trusting a client-supplied txHash — the
 * client doesn't always know the right hash (see findQualifyingPayment below),
 * so any txHash in the request body is accepted but ignored.
 *
 * Idempotent via the (pod_id, user_id, cycle) unique constraint on payments — a
 * retry after a prior call's write already landed just returns success.
 *
 * Required env vars (no VITE_ prefix):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { Client } from 'xrpl'
import { rateLimit } from './lib/rateLimit.js'

const NODES = {
  dev:  'wss://testnet.xrpl-labs.com',
  live: 'wss://xrplcluster.com',
}

const RLUSD_ISSUER = {
  dev:  'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV',
  live: '',
}

const RLUSD_HEX = '524C555344000000000000000000000000000000'

const PG_UNIQUE_VIOLATION = '23505'

function deliveredAmountToNumber(delivered) {
  if (delivered == null) return 0
  if (typeof delivered === 'string') return Number(delivered) / 1_000_000
  return Number(delivered.value ?? 0)
}

function deliveredMatchesToken(delivered, token, env) {
  if (token === 'XRP') return typeof delivered === 'string'
  const issuer = RLUSD_ISSUER[env]
  return !!delivered && typeof delivered === 'object' &&
    delivered.currency === RLUSD_HEX && delivered.issuer === issuer
}

/**
 * Scans fromAddress's own recent payment history for any validated, tesSUCCESS
 * Payment to toAddress delivering >= expectedAmount — rather than looking up
 * one specific txHash. A client-supplied txHash can't be trusted as the sole
 * proof: the client's own "did I already pay?" pre-check (hasAlreadyPaid in
 * src/lib/xrpl.js) may find a qualifying payment without knowing its exact
 * hash (e.g. from an earlier attempt whose result was lost), and sends a
 * placeholder instead of a real hash — looking that placeholder up as a
 * transaction always fails verification even though the payment is real.
 * Scanning for ANY qualifying payment sidesteps that entirely; the (pod_id,
 * user_id, cycle) unique constraint on `payments` is what actually prevents
 * one payment from being credited twice, not which specific hash we found.
 *
 * @returns {Promise<string|null>} the matching txHash if found, else null
 */
async function findQualifyingPayment(fromAddress, toAddress, expectedAmount, token, env) {
  const client = new Client(NODES[env] ?? NODES.dev)
  await client.connect()

  try {
    const { result } = await client.request({ command: 'account_tx', account: fromAddress, limit: 50 })

    for (const entry of result.transactions ?? []) {
      const tx = entry.tx_json ?? entry.tx
      if (
        tx?.TransactionType !== 'Payment' ||
        tx?.Destination !== toAddress ||
        !entry.validated ||
        entry.meta?.TransactionResult !== 'tesSUCCESS'
      ) continue

      const delivered = entry.meta?.delivered_amount ?? entry.meta?.DeliveredAmount
      if (!deliveredMatchesToken(delivered, token, env)) continue

      if (deliveredAmountToNumber(delivered) >= expectedAmount - 1e-6) {
        return entry.hash ?? tx.hash ?? null
      }
    }
    return null
  } catch {
    return null
  } finally {
    await client.disconnect()
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const limited = await rateLimit(supabase, event, 'pod-record-payment', { max: 20, windowSeconds: 300 })
  if (limited) return limited

  try {
    const { podId, walletAddress } = JSON.parse(event.body ?? '{}')
    if (!podId || !walletAddress) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId and walletAddress are required' }) }
    }

    // ── 1. Fetch pod + members ────────────────────────────────────
    const { data: pod } = await supabase
      .from('pods')
      .select(`
        id, chain, token, env, contribution_amount, size, current_cycle, total_cycles, status,
        pod_members ( id, user_id, status, payout_slot, user:users ( id, wallet_address ) )
      `)
      .eq('id', podId)
      .single()

    if (!pod)                    return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    if (pod.chain !== 'XRPL')    return { statusCode: 400, body: JSON.stringify({ error: 'Not an XRPL pod' }) }
    if (pod.status !== 'ACTIVE') return { statusCode: 400, body: JSON.stringify({ error: 'Pod is not currently active' }) }

    const member = pod.pod_members?.find(m => m.user?.wallet_address === walletAddress && m.status === 'ACTIVE')
    if (!member) return { statusCode: 403, body: JSON.stringify({ error: 'Wallet is not an active member of this pod' }) }

    const payoutMember  = pod.pod_members?.find(m => m.payout_slot === pod.current_cycle)
    const recipientAddr = payoutMember?.user?.wallet_address
    if (!recipientAddr) return { statusCode: 400, body: JSON.stringify({ error: 'Payout recipient not assigned for this cycle yet' }) }

    // ── 2. Idempotency: already recorded? ─────────────────────────
    const { data: existing } = await supabase
      .from('payments')
      .select('id')
      .eq('pod_id', podId)
      .eq('user_id', member.user_id)
      .eq('cycle', pod.current_cycle)
      .maybeSingle()

    if (existing) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, alreadyRecorded: true }) }
    }

    // ── 3. If I'm this cycle's recipient, there's nothing to verify on-chain ──
    const env = pod.env ?? 'dev'
    const isSelfRecipient = walletAddress.toLowerCase() === recipientAddr.toLowerCase()
    let confirmedTxHash = 'self-recipient'

    if (!isSelfRecipient) {
      const foundTxHash = await findQualifyingPayment(walletAddress, recipientAddr, pod.contribution_amount, pod.token, env)
      if (!foundTxHash) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Could not verify payment on-chain. Check your wallet before retrying — do not pay twice.' }) }
      }
      confirmedTxHash = foundTxHash
    }

    // ── 4. Record the payment ───────────────────────────────────────
    const { error: insertErr } = await supabase.from('payments').insert({
      pod_id:  podId,
      user_id: member.user_id,
      cycle:   pod.current_cycle,
      amount:  pod.contribution_amount,
      token:   pod.token,
      chain:   pod.chain,
      method:  'wallet',
      tx_hash: confirmedTxHash,
      status:  'CONFIRMED',
      paid_at: new Date().toISOString(),
    })

    if (insertErr && insertErr.code !== PG_UNIQUE_VIOLATION) {
      return { statusCode: 500, body: JSON.stringify({ error: `Payment verified but recording it failed: ${insertErr.message}. Contact support — do not pay again.` }) }
    }

    // ── 5. Advance the cycle if everyone's paid ─────────────────────
    // "Everyone" means every still-ACTIVE member, not the pod's original size —
    // a DEFAULTED member is permanently excluded from paying (see the ACTIVE
    // filter in step 1 above), so comparing against the original size would
    // make the pod stuck at this cycle forever once anyone defaults.
    const { count } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('pod_id', podId)
      .eq('cycle', pod.current_cycle)
      .eq('status', 'CONFIRMED')

    const activeMemberCount = pod.pod_members?.filter(m => m.status === 'ACTIVE').length ?? pod.size

    if ((count ?? 0) >= activeMemberCount) {
      const nextCycle = pod.current_cycle + 1
      const done      = nextCycle > pod.total_cycles
      await supabase
        .from('pods')
        .update(done
          ? { status: 'COMPLETED', completed_at: new Date().toISOString() }
          : { current_cycle: nextCycle, cycle_started_at: new Date().toISOString() },
        )
        .eq('id', podId)
    }

    console.log(`[pod-record-payment] ${walletAddress} paid cycle ${pod.current_cycle} of pod ${podId} | tx: ${confirmedTxHash}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, txHash: confirmedTxHash }),
    }

  } catch (e) {
    console.error('[pod-record-payment]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
