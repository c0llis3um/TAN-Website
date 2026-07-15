/**
 * Netlify Function: claim-xrpl-collateral
 *
 * POST /.netlify/functions/claim-xrpl-collateral
 * Body: { podId: string, walletAddress: string }
 *
 * Sends the requesting member's remaining collateral (2× contribution, minus
 * any collateral_slash payments already taken from them for missed cycles —
 * slash-xrpl-collateral.js takes exactly 1× contribution per default and the
 * member is excluded from further cycles after that, so this is never more
 * than one deduction) back from the pod escrow wallet. Idempotent — won't
 * send twice to the same member.
 *
 * Required env vars (no VITE_ prefix):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ESCROW_SEED_ENCRYPTION_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { Client, Wallet, xrpToDrops } from 'xrpl'
import { decryptSeed } from './lib/crypto.js'

const NODES = {
  dev:  'wss://testnet.xrpl-labs.com',
  live: 'wss://xrplcluster.com',
}

const RLUSD_ISSUER = {
  dev:  'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV',
  live: '',
}

const RLUSD_HEX = '524C555344000000000000000000000000000000'

// Postgres unique_violation — the (pod_id, user_id, cycle) constraint on `payments`
// is the real idempotency guard; the pre-check below just avoids a redundant chain
// submission in the common case (e.g. a concurrent release-xrpl-collateral.js run).
const PG_UNIQUE_VIOLATION = '23505'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  try {
    const { podId, walletAddress } = JSON.parse(event.body ?? '{}')
    if (!podId || !walletAddress) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId and walletAddress required' }) }
    }

    // ── 1. Fetch pod ───────────────────────────────────────────
    const { data: pod } = await supabase
      .from('pods')
      .select(`
        id, chain, token, contribution_amount, status, env,
        pod_members ( id, user:users ( id, wallet_address ) )
      `)
      .eq('id', podId)
      .single()

    // COMPLETED = normal payout cycle finished. CANCELLED/EXPIRED = pod never
    // filled or was cancelled by the organizer — members get their collateral back.
    const REFUNDABLE_STATUSES = ['COMPLETED', 'CANCELLED', 'EXPIRED']

    if (!pod)                                   return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    if (pod.chain !== 'XRPL')                   return { statusCode: 400, body: JSON.stringify({ error: 'Not an XRPL pod' }) }
    if (!REFUNDABLE_STATUSES.includes(pod.status)) return { statusCode: 400, body: JSON.stringify({ error: 'Pod is not eligible for a collateral claim yet' }) }

    // ── 2. Verify caller is a member ───────────────────────────
    const member = pod.pod_members?.find(m => m.user?.wallet_address === walletAddress)
    if (!member) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Wallet is not a member of this pod' }) }
    }

    // ── 3. Check not already claimed (or already released by an admin) ─────
    const { data: existing } = await supabase
      .from('payments')
      .select('id')
      .eq('pod_id', podId)
      .eq('user_id', member.user.id)
      .eq('cycle', 0)
      .eq('method', 'collateral_return')
      .maybeSingle()

    if (existing) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Collateral already claimed' }) }
    }

    // ── 4. Get escrow seed ─────────────────────────────────────
    const { data: escrowRow } = await supabase
      .from('pod_escrows')
      .select('escrow_seed')
      .eq('pod_id', podId)
      .single()

    if (!escrowRow?.escrow_seed) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No escrow found for this pod' }) }
    }

    // ── 4b. Deduct any prior collateral slashes for this member ─────
    const { data: slashes } = await supabase
      .from('payments')
      .select('amount')
      .eq('pod_id', podId)
      .eq('user_id', member.user.id)
      .eq('method', 'collateral_slash')

    const alreadySlashed = (slashes ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
    const amount = Math.max(0, pod.contribution_amount * 2 - alreadySlashed)

    if (amount <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No collateral remaining to claim — it was fully used to cover a missed payment.' }) }
    }

    // ── 5. Send collateral ─────────────────────────────────────
    const isRlusd = pod.token === 'RLUSD'
    const env     = pod.env ?? 'dev'
    const issuer  = RLUSD_ISSUER[env]

    if (isRlusd && !issuer) {
      return { statusCode: 400, body: JSON.stringify({ error: 'RLUSD issuer not configured for this environment' }) }
    }

    const client = new Client(NODES[env] ?? NODES.dev)
    await client.connect()

    const escrowWallet = Wallet.fromSeed(decryptSeed(escrowRow.escrow_seed))
    let txHash

    try {
      const payment = {
        TransactionType: 'Payment',
        Account:         escrowWallet.address,
        Destination:     walletAddress,
        Amount: isRlusd
          ? { currency: RLUSD_HEX, issuer, value: String(amount) }
          : xrpToDrops(String(amount)),
      }

      const prepared = await client.autofill(payment)
      const signed   = escrowWallet.sign(prepared)
      const result    = await client.submitAndWait(signed.tx_blob)
      const txResult  = result.result.meta?.TransactionResult ?? ''

      if (txResult !== 'tesSUCCESS') {
        throw new Error(`Payment failed: ${txResult}`)
      }

      txHash = result.result.hash
    } finally {
      if (client.isConnected()) {
        await client.disconnect()
      }
    }

    // ── 6. Record claim ────────────────────────────────────────
    const { error: insertErr } = await supabase.from('payments').insert({
      pod_id:  podId,
      user_id: member.user.id,
      cycle:   0,
      amount,
      token:   pod.token,
      chain:   pod.chain,
      method:  'collateral_return',
      tx_hash: txHash,
      status:  'CONFIRMED',
      paid_at: new Date().toISOString(),
    })

    if (insertErr && insertErr.code !== PG_UNIQUE_VIOLATION) {
      console.error(
        `[claim-xrpl-collateral] RECONCILIATION NEEDED — payment sent (tx: ${txHash}) but payments ` +
        `insert failed for pod ${podId} / user ${member.user.id}: ${insertErr.message}`,
      )
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true, txHash, amount,
          reconciliationNeeded: true,
          warning: `Payment sent on-chain but recording it failed (${insertErr.message}). Manual reconciliation required.`,
        }),
      }
    }

    console.log(`[claim-xrpl-collateral] ${walletAddress} claimed ${amount} ${pod.token} | tx: ${txHash}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, txHash, amount }),
    }

  } catch (e) {
    console.error('[claim-xrpl-collateral]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
