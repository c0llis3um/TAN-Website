/**
 * Netlify Function: slash-xrpl-collateral
 *
 * POST /.netlify/functions/slash-xrpl-collateral
 * Body: { podId: string, memberUserId: string }
 * Headers: Authorization: Bearer <admin-supabase-jwt>
 *
 * When a member misses a cycle payment:
 *   1. Verifies cycle is overdue and member hasn't paid
 *   2. Sends contribution_amount XRP from escrow → current cycle's payout recipient
 *   3. Marks the member as DEFAULTED in pod_members
 *   4. Records a collateral_slash payment in the payments table
 *
 * Idempotent — won't slash the same member twice for the same cycle.
 */

import { createClient } from '@supabase/supabase-js'
import { Client, Wallet, xrpToDrops } from 'xrpl'

const NODES = {
  dev:  'wss://s.devnet.rippletest.net:51233',
  live: 'wss://xrplcluster.com',
}

function cycleMs(pod) {
  const n = pod.cycle_frequency_days ?? 7
  return pod.env === 'dev' ? n * 36e5 : n * 864e5
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  const token = (event.headers.authorization ?? '').replace('Bearer ', '').trim()
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  // Verify caller is an admin
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!admin) return { statusCode: 403, body: JSON.stringify({ error: 'Not an admin' }) }

  try {
    const { podId, memberUserId } = JSON.parse(event.body ?? '{}')
    if (!podId || !memberUserId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId and memberUserId required' }) }
    }

    // ── 1. Fetch pod ──────────────────────────────────────────
    const { data: pod } = await supabase
      .from('pods')
      .select(`
        id, chain, token, contribution_amount, status, env,
        current_cycle, cycle_started_at, cycle_frequency_days,
        pod_members (
          id, user_id, payout_slot, status,
          user:users ( id, wallet_address )
        )
      `)
      .eq('id', podId)
      .single()

    if (!pod)                     return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    if (pod.chain !== 'XRPL')     return { statusCode: 400, body: JSON.stringify({ error: 'Not an XRPL pod' }) }
    if (pod.status !== 'ACTIVE')  return { statusCode: 400, body: JSON.stringify({ error: 'Pod is not active' }) }

    // ── 2. Verify cycle is actually overdue ───────────────────
    const cycleDue = new Date(pod.cycle_started_at).getTime() + cycleMs(pod)
    if (Date.now() < cycleDue) {
      const msLeft = cycleDue - Date.now()
      return { statusCode: 400, body: JSON.stringify({ error: `Cycle not yet overdue. ${Math.ceil(msLeft / 60000)} minutes remaining.` }) }
    }

    // ── 3. Find defaulting member ─────────────────────────────
    const defaultingMember = pod.pod_members?.find(m => m.user_id === memberUserId)
    if (!defaultingMember) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Member not found in this pod' }) }
    }

    // ── 4. Check member hasn't paid this cycle ────────────────
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('pod_id', podId)
      .eq('user_id', memberUserId)
      .eq('cycle', pod.current_cycle)
      .in('status', ['CONFIRMED', 'PENDING'])
      .maybeSingle()

    if (existingPayment) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Member has already paid this cycle' }) }
    }

    // ── 5. Check not already slashed this cycle ───────────────
    const { data: existingSlash } = await supabase
      .from('payments')
      .select('id')
      .eq('pod_id', podId)
      .eq('user_id', memberUserId)
      .eq('cycle', pod.current_cycle)
      .eq('method', 'collateral_slash')
      .maybeSingle()

    if (existingSlash) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Collateral already slashed for this cycle' }) }
    }

    // ── 6. Find current cycle's payout recipient ──────────────
    const recipient = pod.pod_members?.find(m => m.payout_slot === pod.current_cycle)
    if (!recipient?.user?.wallet_address) {
      return { statusCode: 400, body: JSON.stringify({ error: `No payout recipient found for cycle ${pod.current_cycle}` }) }
    }

    // ── 7. Get escrow seed ────────────────────────────────────
    const { data: escrowRow } = await supabase
      .from('pod_escrows')
      .select('escrow_seed')
      .eq('pod_id', podId)
      .single()

    if (!escrowRow?.escrow_seed) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No escrow found for this pod' }) }
    }

    // ── 8. Send slashed collateral to payout recipient ────────
    const env    = pod.env ?? 'dev'
    const client = new Client(NODES[env] ?? NODES.dev)
    await client.connect()

    const escrowWallet = Wallet.fromSeed(escrowRow.escrow_seed)
    const amount       = pod.contribution_amount   // 1× covers the missed payment

    const payment = {
      TransactionType: 'Payment',
      Account:         escrowWallet.address,
      Destination:     recipient.user.wallet_address,
      Amount:          xrpToDrops(String(amount)),
    }

    const prepared = await client.autofill(payment)
    const signed   = escrowWallet.sign(prepared)
    const result   = await client.submitAndWait(signed.tx_blob)
    await client.disconnect()

    const txHash = result.result.hash

    // ── 9. Record slash + mark member DEFAULTED ───────────────
    await Promise.all([
      supabase.from('payments').insert({
        pod_id:  podId,
        user_id: memberUserId,
        cycle:   pod.current_cycle,
        amount,
        token:   pod.token,
        chain:   pod.chain,
        method:  'collateral_slash',
        tx_hash: txHash,
        status:  'CONFIRMED',
        paid_at: new Date().toISOString(),
      }),
      supabase.from('pod_members')
        .update({ status: 'DEFAULTED' })
        .eq('id', defaultingMember.id),
    ])

    console.log(`[slash-xrpl-collateral] Member ${memberUserId} defaulted on cycle ${pod.current_cycle}. Sent ${amount} ${pod.token} → ${recipient.user.wallet_address} | tx: ${txHash}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success:       true,
        txHash,
        amount,
        sentTo:        recipient.user.wallet_address,
        slashedMember: memberUserId,
        cycle:         pod.current_cycle,
      }),
    }

  } catch (e) {
    console.error('[slash-xrpl-collateral]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
