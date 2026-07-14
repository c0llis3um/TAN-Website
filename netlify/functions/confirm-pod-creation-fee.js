/**
 * Netlify Function: confirm-pod-creation-fee
 *
 * POST /.netlify/functions/confirm-pod-creation-fee
 * Body: { podId: string, txHash: string }
 *
 * Live-XRPL-only step: verifies the organizer's creation-fee payment landed on the
 * active XRPL treasury wallet, then finalizes the pod (deployed_at, creation_fee_tx,
 * creation_fee_paid, status). The only way `pods` rows change for this step now that
 * anon/authenticated write grants on `pods` have been revoked (see
 * supabase/migrations/028_lock_fund_moving_tables.sql).
 *
 * Unlike collateral verification (pod-join.js / pod-record-payment.js), the exact
 * fee amount isn't independently re-derived here — the fee goes to the platform's
 * own treasury, not to another user, so the risk of under-verifying the amount is
 * "organizer underpays a platform fee," not "attacker redirects someone else's
 * funds." A real, successful payment from the organizer to the current treasury
 * wallet is enough.
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

async function verifyFeePayment(txHash, fromAddress, toAddress, env) {
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

    return true
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

  try {
    const { podId, txHash } = JSON.parse(event.body ?? '{}')
    if (!podId || !txHash) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId and txHash are required' }) }
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

    const paid = await verifyFeePayment(txHash, organizerAddr, treasury.address, pod.env)
    if (!paid) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Could not verify creation fee payment on-chain.' }) }
    }

    const { error: updateErr } = await supabase
      .from('pods')
      .update({
        status:             'OPEN',
        deployed_at:        new Date().toISOString(),
        creation_fee_tx:    txHash,
        creation_fee_paid:  true,
      })
      .eq('id', podId)

    if (updateErr) {
      return { statusCode: 500, body: JSON.stringify({ error: `Fee verified but pod update failed: ${updateErr.message}` }) }
    }

    console.log(`[confirm-pod-creation-fee] pod ${podId} fee confirmed | tx: ${txHash}`)

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
