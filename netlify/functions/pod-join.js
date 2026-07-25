/**
 * Netlify Function: pod-join
 *
 * POST /.netlify/functions/pod-join
 * Body: { podId: string, walletAddress: string }
 *
 * Server-verified pod join — the only way pod_members/users/pods rows change for a
 * join now that anon/authenticated write grants on those tables have been revoked
 * (see supabase/migrations/028_lock_fund_moving_tables.sql). Verifies a real,
 * validated on-chain collateral payment exists before recording anything, folding
 * in what used to be client-side joinPod() + maybeActivatePod() (src/lib/db.js).
 *
 * Verification scans walletAddress's own recent payment history for a qualifying
 * payment rather than trusting a client-supplied txHash — the client doesn't
 * always know the right hash (see findQualifyingPayment below), so any txHash in
 * the request body is accepted but ignored.
 *
 * Idempotent — if the wallet is already a member, returns success without
 * re-verifying (covers a retry after a prior call's DB write already landed).
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

// Postgres unique_violation — the (pod_id, user_id) constraint on pod_members is the
// real idempotency guard against a concurrent double-join; the pre-check below just
// avoids a redundant ledger lookup in the common case.
const PG_UNIQUE_VIOLATION = '23505'

function deliveredAmountToNumber(delivered) {
  if (delivered == null) return 0
  if (typeof delivered === 'string') return Number(delivered) / 1_000_000 // XRP drops
  return Number(delivered.value ?? 0) // issued currency
}

function deliveredMatchesToken(delivered, token, env) {
  if (token === 'XRP') return typeof delivered === 'string'
  const issuer = RLUSD_ISSUER[env]
  return !!delivered && typeof delivered === 'object' &&
    delivered.currency === RLUSD_HEX && delivered.issuer === issuer
}

/**
 * A transaction hash that's already recorded as proof somewhere else (another
 * join's collateral_tx, or any payments.tx_hash) can't be reused as proof
 * again — otherwise one real payment could satisfy verification an unlimited
 * number of times. Concretely: a wallet's old, already-refunded payment to a
 * pod's escrow (e.g. from a since-fixed bug, or a cancelled attempt) would
 * otherwise still show up as a "qualifying payment" forever, since the chain
 * itself has no notion of a transaction being "used up."
 */
async function isTxHashAlreadyUsed(supabase, txHash) {
  const [{ count: memberCount }, { count: paymentCount }] = await Promise.all([
    supabase.from('pod_members').select('id', { count: 'exact', head: true }).eq('collateral_tx', txHash),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('tx_hash', txHash),
  ])
  return (memberCount ?? 0) > 0 || (paymentCount ?? 0) > 0
}

/**
 * Scans fromAddress's own recent payment history for any validated, tesSUCCESS
 * Payment to toAddress delivering >= expectedAmount, that hasn't already been
 * used as proof elsewhere — rather than looking up one specific txHash. A
 * client-supplied txHash can't be trusted as the sole proof: the client's own
 * "did I already pay?" pre-check (hasAlreadyPaid in src/lib/xrpl.js) may find
 * a qualifying payment without knowing its exact hash (e.g. from an earlier
 * attempt whose result was lost), and sends no usable hash at all in that
 * case — looking up nothing (or a placeholder) as a transaction always fails
 * verification even though the payment is real. Scanning for ANY qualifying,
 * not-already-used payment sidesteps that entirely.
 *
 * @returns {Promise<string|null>} the matching txHash if found, else null
 */
async function findQualifyingPayment(supabase, fromAddress, toAddress, expectedAmount, token, env) {
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
      if (deliveredAmountToNumber(delivered) < expectedAmount - 1e-6) continue

      const candidateHash = entry.hash ?? tx.hash
      if (!candidateHash) continue
      if (await isTxHashAlreadyUsed(supabase, candidateHash)) continue

      return candidateHash
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

  const limited = await rateLimit(supabase, event, 'pod-join', { max: 20, windowSeconds: 300 })
  if (limited) return limited

  try {
    const { podId, walletAddress } = JSON.parse(event.body ?? '{}')
    if (!podId || !walletAddress) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId and walletAddress are required' }) }
    }

    // ── 1. Fetch pod ───────────────────────────────────────────
    const { data: pod } = await supabase
      .from('pods')
      .select('id, chain, token, env, contribution_amount, collateral_multiplier, size, payout_method, status, expires_at, contract_address, deployed_at')
      .eq('id', podId)
      .single()

    if (!pod)                 return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    if (pod.chain !== 'XRPL') return { statusCode: 400, body: JSON.stringify({ error: 'Not an XRPL pod' }) }

    // ── 2. Find or create the user row ──────────────────────────
    let { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('wallet_address', walletAddress)
      .maybeSingle()

    if (!user) {
      const { data: created, error: createErr } = await supabase
        .from('users')
        .insert({ wallet_address: walletAddress, chain: 'XRPL', lang: 'es' })
        .select('id')
        .single()
      if (createErr) return { statusCode: 500, body: JSON.stringify({ error: `Could not create user: ${createErr.message}` }) }
      user = created
    }

    // ── 3. Idempotency: already a member? Short-circuit before any pod-state
    // checks below — a wallet that already successfully joined should get a
    // silent success on retry even if the pod has since filled up and moved
    // past OPEN (e.g. every other slot filled while this client was retrying
    // after a dropped response).
    const { data: existingMember } = await supabase
      .from('pod_members')
      .select('id')
      .eq('pod_id', podId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMember) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, alreadyMember: true }) }
    }

    // ── 4. Pod must still be open to accept a NEW member ────────────
    if (pod.status !== 'OPEN') return { statusCode: 400, body: JSON.stringify({ error: 'Pod is no longer open' }) }
    if (pod.expires_at && new Date(pod.expires_at) < new Date()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Pod has expired' }) }
    }
    if (!pod.contract_address) return { statusCode: 400, body: JSON.stringify({ error: 'Pod has no escrow wallet yet' }) }
    // Live pods aren't fully deployed until the organizer's creation fee is
    // confirmed (confirm-pod-creation-fee.js sets deployed_at) — dev pods get
    // deployed_at immediately at escrow creation since they have no fee to
    // wait on. Blocks members from locking real collateral into a pod the
    // platform was never actually paid to host.
    if (!pod.deployed_at) {
      return { statusCode: 400, body: JSON.stringify({ error: 'This pod has not finished deploying yet — the organizer still needs to complete the creation fee payment.' }) }
    }

    // ── 5. Verify the collateral payment on-chain ─────────────────
    // Stored per-pod at creation, not recomputed from current size — see
    // migration 032. Existing pods keep 2 (what their members actually paid).
    const collateralAmount = pod.contribution_amount * pod.collateral_multiplier
    const env = pod.env ?? 'dev'
    const foundTxHash = await findQualifyingPayment(supabase, walletAddress, pod.contract_address, collateralAmount, pod.token, env)
    if (!foundTxHash) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Could not verify collateral payment on-chain. Check your wallet before retrying — do not pay twice.' }) }
    }

    // ── 6. Record membership ───────────────────────────────────────
    const { error: joinErr } = await supabase
      .from('pod_members')
      .insert({ pod_id: podId, user_id: user.id, status: 'ACTIVE', collateral_tx: foundTxHash })

    if (joinErr && joinErr.code !== PG_UNIQUE_VIOLATION) {
      return { statusCode: 500, body: JSON.stringify({ error: `Payment verified but membership save failed: ${joinErr.message}. Contact support — do not pay again.` }) }
    }

    // ── 7. Activate the pod if it's now full ───────────────────────
    const { data: memberRows } = await supabase
      .from('pod_members')
      .select('id')
      .eq('pod_id', podId)
      .order('joined_at', { ascending: true })

    if ((memberRows?.length ?? 0) >= pod.size) {
      const slots = memberRows.map((_, i) => i + 1)
      if (pod.payout_method === 'random') {
        for (let i = slots.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [slots[i], slots[j]] = [slots[j], slots[i]]
        }
      }
      await Promise.all(memberRows.map((m, i) =>
        supabase.from('pod_members').update({ payout_slot: slots[i] }).eq('id', m.id),
      ))
      await supabase
        .from('pods')
        .update({ status: 'ACTIVE', current_cycle: 1, cycle_started_at: new Date().toISOString() })
        .eq('id', podId)
    }

    console.log(`[pod-join] ${walletAddress} joined pod ${podId} | tx: ${foundTxHash}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    }

  } catch (e) {
    console.error('[pod-join]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
