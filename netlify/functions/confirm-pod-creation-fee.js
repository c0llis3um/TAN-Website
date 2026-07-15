/**
 * Netlify Function: confirm-pod-creation-fee
 *
 * POST /.netlify/functions/confirm-pod-creation-fee
 * Body: { podId: string }
 *
 * Live-XRPL-only step: verifies the organizer's creation-fee payment landed on the
 * active XRPL treasury wallet, then finalizes the pod (deployed_at, creation_fee_tx,
 * creation_fee_paid, status). The only way `pods` rows change for this step now that
 * anon/authenticated write grants on `pods` have been revoked (see
 * supabase/migrations/028_lock_fund_moving_tables.sql).
 *
 * Verification scans the organizer's own recent payment history for a qualifying
 * payment (same approach as pod-join.js / pod-record-payment.js) rather than
 * trusting a client-supplied txHash, and retries a few times server-side — mainnet
 * confirmation can occasionally take longer than the client's own poll window, and
 * the client no longer blocks on that wait (see skipVerify in src/lib/xrpl.js /
 * CreatePod's fee step), so this is the only place that actually confirms the
 * payment landed. Any txHash in the request body is accepted but ignored.
 *
 * Unlike collateral verification, the exact fee amount isn't independently
 * re-derived here — the fee goes to the platform's own treasury, not to another
 * user, so the risk of under-verifying the amount is "organizer underpays a
 * platform fee," not "attacker redirects someone else's funds." A real,
 * successful payment from the organizer to the current treasury wallet is enough.
 * Reuse is still prevented: the same on-chain payment can't be recycled to
 * finalize a second pod's creation fee for free.
 *
 * Required env vars (no VITE_ prefix):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { Client } from 'xrpl'

const NODES = {
  dev:  'wss://testnet.xrpl-labs.com',
  live: 'wss://xrplcluster.com',
}

// Kept small — Netlify Functions have a default execution timeout as low as
// 10s on some plans (no override is configured in netlify.toml), and this
// runs after other Supabase/XRPL round-trips in the same invocation. The
// client (CreatePod's fee step) wraps this call in its own outer retry loop,
// so additional attempts happen across fresh invocations instead of piling
// more retries into one that risks getting killed mid-request.
const RETRY_ATTEMPTS = 2
const RETRY_DELAY_MS = 2000

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/** A fee payment already recorded as some pod's creation_fee_tx can't be reused for another pod. */
async function isTxHashAlreadyUsed(supabase, txHash) {
  const { count } = await supabase
    .from('pods')
    .select('id', { count: 'exact', head: true })
    .eq('creation_fee_tx', txHash)
  return (count ?? 0) > 0
}

/** Scans fromAddress's own recent payment history for any qualifying, not-already-used fee payment to toAddress. */
async function findQualifyingFeePayment(supabase, fromAddress, toAddress, env) {
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

async function findQualifyingFeePaymentWithRetries(supabase, fromAddress, toAddress, env) {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const found = await findQualifyingFeePayment(supabase, fromAddress, toAddress, env)
    if (found) return found
    if (attempt < RETRY_ATTEMPTS) await sleep(RETRY_DELAY_MS)
  }
  return null
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  try {
    const { podId } = JSON.parse(event.body ?? '{}')
    if (!podId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId is required' }) }
    }

    const { data: pod } = await supabase
      .from('pods')
      .select('id, chain, env, organizer_id, organizer:users!organizer_id(wallet_address)')
      .eq('id', podId)
      .single()

    if (!pod)                 return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    if (pod.chain !== 'XRPL') return { statusCode: 400, body: JSON.stringify({ error: 'Not an XRPL pod' }) }
    if (pod.env !== 'live')   return { statusCode: 400, body: JSON.stringify({ error: 'Creation fee only applies to live pods' }) }

    const organizerAddr = pod.organizer?.wallet_address
    if (!organizerAddr) return { statusCode: 400, body: JSON.stringify({ error: 'Pod has no organizer wallet on file' }) }

    const { data: treasury } = await supabase
      .from('treasury_wallets')
      .select('address')
      .eq('chain', 'XRPL')
      .eq('active', true)
      .maybeSingle()

    if (!treasury?.address) return { statusCode: 400, body: JSON.stringify({ error: 'No active XRPL treasury wallet configured' }) }

    const foundTxHash = await findQualifyingFeePaymentWithRetries(supabase, organizerAddr, treasury.address, pod.env)
    if (!foundTxHash) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Could not verify creation fee payment on-chain. If you already paid, it may still be confirming — wait a moment and try again rather than paying twice.' }) }
    }

    const { error: updateErr } = await supabase
      .from('pods')
      .update({
        status:             'OPEN',
        deployed_at:        new Date().toISOString(),
        creation_fee_tx:    foundTxHash,
        creation_fee_paid:  true,
      })
      .eq('id', podId)

    if (updateErr) {
      return { statusCode: 500, body: JSON.stringify({ error: `Fee verified but pod update failed: ${updateErr.message}` }) }
    }

    console.log(`[confirm-pod-creation-fee] pod ${podId} fee confirmed | tx: ${foundTxHash}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    }

  } catch (e) {
    console.error('[confirm-pod-creation-fee]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
