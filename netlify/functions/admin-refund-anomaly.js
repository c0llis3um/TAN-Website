/**
 * Netlify Function: admin-refund-anomaly
 *
 * POST /.netlify/functions/admin-refund-anomaly
 * Body: { podId: string, senderAddress: string, toAddress: string,
 *         amount: number, reason: string }
 * Headers: Authorization: Bearer <supabase_access_token>
 *
 * Validates admin session, sends `amount` of the pod's token from its XRPL
 * escrow wallet to `toAddress`, and logs the action to anomaly_refunds. Used
 * by the admin Anomalies panel to return stray payments — collateral sent to
 * an escrow by a wallet that never became (or overpaid as) a pod member —
 * back out.
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

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const authHeader  = event.headers['authorization'] ?? ''
  const accessToken = authHeader.replace('Bearer ', '').trim()
  if (!accessToken) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing authorization token' }) }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  try {
    // ── 0. Validate admin session ───────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken)
    if (authErr || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }
    }

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', user.email)
      .single()

    if (!adminRow) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Not an admin' }) }
    }

    const { podId, senderAddress, toAddress, amount, reason } = JSON.parse(event.body ?? '{}')
    if (!podId || !senderAddress || !toAddress || !amount || !reason) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId, senderAddress, toAddress, amount, and reason are required' }) }
    }
    if (!(Number(amount) > 0)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'amount must be a positive number' }) }
    }

    // ── 1. Fetch pod ───────────────────────────────────────────
    const { data: pod } = await supabase
      .from('pods')
      .select('id, chain, token, env, contract_address')
      .eq('id', podId)
      .single()

    if (!pod)                       return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    if (pod.chain !== 'XRPL')       return { statusCode: 400, body: JSON.stringify({ error: 'Not an XRPL pod' }) }
    if (!pod.contract_address)      return { statusCode: 400, body: JSON.stringify({ error: 'Pod has no escrow wallet' }) }

    // ── 2. Get escrow seed ──────────────────────────────────────
    const { data: escrowRow } = await supabase
      .from('pod_escrows')
      .select('escrow_seed')
      .eq('pod_id', podId)
      .single()

    if (!escrowRow?.escrow_seed) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No escrow found for this pod' }) }
    }

    // ── 3. Send refund ──────────────────────────────────────────
    const isRlusd = pod.token === 'RLUSD'
    const env     = pod.env ?? 'dev'
    const issuer  = RLUSD_ISSUER[env]

    if (isRlusd && !issuer) {
      return { statusCode: 400, body: JSON.stringify({ error: 'RLUSD issuer not configured for this environment' }) }
    }

    const client = new Client(NODES[env] ?? NODES.dev)
    await client.connect()

    let txHash
    try {
      const payment = {
        TransactionType: 'Payment',
        Account:         pod.contract_address,
        Destination:     toAddress,
        Amount: isRlusd
          ? { currency: RLUSD_HEX, issuer, value: String(amount) }
          : xrpToDrops(String(amount)),
      }

      const escrowWallet = Wallet.fromSeed(decryptSeed(escrowRow.escrow_seed))
      const prepared      = await client.autofill(payment)
      const signed         = escrowWallet.sign(prepared)
      const result          = await client.submitAndWait(signed.tx_blob)
      const txResult          = result.result.meta?.TransactionResult ?? ''

      if (txResult !== 'tesSUCCESS') {
        throw new Error(`Refund failed: ${txResult}`)
      }
      txHash = result.result.hash
    } finally {
      if (client.isConnected()) await client.disconnect()
    }

    // ── 4. Log the refund ────────────────────────────────────────
    const { error: logErr } = await supabase.from('anomaly_refunds').insert({
      pod_id:         podId,
      escrow_address: pod.contract_address,
      sender_address: senderAddress,
      to_address:      toAddress,
      amount,
      token:          pod.token,
      reason,
      tx_hash:        txHash,
      admin_id:       adminRow.id,
    })

    if (logErr) {
      console.error(
        `[admin-refund-anomaly] RECONCILIATION NEEDED — refund sent (tx: ${txHash}) but ` +
        `anomaly_refunds insert failed for pod ${podId}: ${logErr.message}`,
      )
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true, txHash,
          reconciliationNeeded: true,
          warning: `Refund sent on-chain but logging it failed (${logErr.message}). Record it manually.`,
        }),
      }
    }

    console.log(`[admin-refund-anomaly] Refunded ${amount} ${pod.token} to ${toAddress} for pod ${podId} | tx: ${txHash}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, txHash }),
    }

  } catch (e) {
    console.error('[admin-refund-anomaly]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
