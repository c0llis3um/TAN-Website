/**
 * Netlify Function: claim-xrpl-collateral
 *
 * POST /.netlify/functions/claim-xrpl-collateral
 * Body: { podId: string, walletAddress: string }
 *
 * Sends 2× contribution back from the pod escrow wallet to the
 * requesting member. Idempotent — won't send twice to the same member.
 *
 * Required env vars (no VITE_ prefix):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { Client, Wallet, xrpToDrops } from 'xrpl'

const NODES = {
  dev:  'wss://s.devnet.rippletest.net:51233',
  live: 'wss://xrplcluster.com',
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

    if (!pod)                      return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    if (pod.chain !== 'XRPL')      return { statusCode: 400, body: JSON.stringify({ error: 'Not an XRPL pod' }) }
    if (pod.status !== 'COMPLETED') return { statusCode: 400, body: JSON.stringify({ error: 'Pod not completed yet' }) }

    // ── 2. Verify caller is a member ───────────────────────────
    const member = pod.pod_members?.find(m => m.user?.wallet_address === walletAddress)
    if (!member) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Wallet is not a member of this pod' }) }
    }

    // ── 3. Check not already claimed ───────────────────────────
    const { data: existing } = await supabase
      .from('payments')
      .select('id')
      .eq('pod_id', podId)
      .eq('user_id', member.user.id)
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

    // ── 5. Send collateral ─────────────────────────────────────
    const env    = pod.env ?? 'dev'
    const client = new Client(NODES[env] ?? NODES.dev)
    await client.connect()

    const escrowWallet = Wallet.fromSeed(escrowRow.escrow_seed)
    const amount       = pod.contribution_amount * 2

    const payment = {
      TransactionType: 'Payment',
      Account:         escrowWallet.address,
      Destination:     walletAddress,
      Amount:          xrpToDrops(String(amount)),
    }

    const prepared = await client.autofill(payment)
    const signed   = escrowWallet.sign(prepared)
    const result   = await client.submitAndWait(signed.tx_blob)
    await client.disconnect()

    const txHash = result.result.hash

    // ── 6. Record claim ────────────────────────────────────────
    await supabase.from('payments').insert({
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
