/**
 * Netlify Function: pod-join
 *
 * POST /.netlify/functions/pod-join
 * Body: { podId: string, walletAddress: string, txHash: string }
 *
 * Server-verified pod join — the only way pod_members/users/pods rows change for a
 * join now that anon/authenticated write grants on those tables have been revoked
 * (see supabase/migrations/028_lock_fund_moving_tables.sql). Verifies txHash is a
 * real, validated on-chain collateral payment before recording anything, folding in
 * what used to be client-side joinPod() + maybeActivatePod() (src/lib/db.js).
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

/** Verifies txHash is a validated, tesSUCCESS Payment of >= expectedAmount from fromAddress to toAddress. */
async function verifyCollateralPayment(txHash, fromAddress, toAddress, expectedAmount, token, env) {
  const client = new Client(NODES[env] ?? NODES.dev)
  await client.connect()

  try {
    const resp = await client.request({ command: 'tx', transaction: txHash })
    const result = resp.result
    if (!result?.validated) return false

    const tx = result.tx_json ?? result
    if (tx?.TransactionType !== 'Payment')       return false
    if (tx?.Account !== fromAddress)             return false
    if (tx?.Destination !== toAddress)           return false
    if (result.meta?.TransactionResult !== 'tesSUCCESS') return false

    const delivered = result.meta?.delivered_amount ?? result.meta?.DeliveredAmount
    if (!deliveredMatchesToken(delivered, token, env)) return false

    return deliveredAmountToNumber(delivered) >= expectedAmount - 1e-6
  } catch {
    return false
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
    const { podId, walletAddress, txHash } = JSON.parse(event.body ?? '{}')
    if (!podId || !walletAddress || !txHash) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId, walletAddress, and txHash are required' }) }
    }

    // ── 1. Fetch pod ───────────────────────────────────────────
    const { data: pod } = await supabase
      .from('pods')
      .select('id, chain, token, env, contribution_amount, size, payout_method, status, expires_at, contract_address')
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

    // ── 5. Verify the collateral payment on-chain ─────────────────
    const collateralAmount = pod.contribution_amount * 2
    const env = pod.env ?? 'dev'
    const paid = await verifyCollateralPayment(txHash, walletAddress, pod.contract_address, collateralAmount, pod.token, env)
    if (!paid) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Could not verify collateral payment on-chain. Check your wallet before retrying — do not pay twice.' }) }
    }

    // ── 6. Record membership ───────────────────────────────────────
    const { error: joinErr } = await supabase
      .from('pod_members')
      .insert({ pod_id: podId, user_id: user.id, status: 'ACTIVE', collateral_tx: txHash })

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

    console.log(`[pod-join] ${walletAddress} joined pod ${podId} | tx: ${txHash}`)

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
