/**
 * Netlify Scheduled Function: check-overdue
 *
 * Runs daily at 10:00 UTC (configurable in netlify.toml).
 * Scans all ACTIVE XRPL pods for members who missed their payment.
 * Automatically slashes collateral and marks them DEFAULTED.
 *
 * Also sweeps OPEN pods past their expires_at (default: 7 days after
 * creation, see migration 024) that never filled up, and marks them
 * EXPIRED so members can claim their collateral back instead of it
 * sitting locked in an escrow that's never going to activate.
 *
 * Safe to re-run — slash logic is idempotent (won't slash twice per cycle).
 */

import { createClient } from '@supabase/supabase-js'
import { Client, Wallet, xrpToDrops } from 'xrpl'
import { paymentReminderEmail, overdueSlashEmail, sendEmail } from './lib/email.js'
import { sendPushToUser } from './lib/push.js'

const NODES = {
  dev:  'wss://testnet.xrpl-labs.com',
  live: 'wss://xrplcluster.com',
}

// How long before a cycle's due date to send the "payment due soon" reminder.
const REMINDER_WINDOW_MS = 2 * 864e5 // 2 days

function cycleMs(pod) {
  const n = pod.cycle_frequency_days ?? 7
  return pod.env === 'dev' ? n * 36e5 : n * 864e5
}

async function sendDueSoonReminders({ supabase, pod, cycleDue }) {
  const cycle = pod.current_cycle

  for (const member of pod.pod_members ?? []) {
    if (member.status === 'DEFAULTED') continue

    const { data: paid } = await supabase
      .from('payments')
      .select('id')
      .eq('pod_id', pod.id)
      .eq('user_id', member.user_id)
      .eq('cycle', cycle)
      .in('status', ['CONFIRMED', 'PENDING'])
      .maybeSingle()

    if (paid) continue

    // Email and push are independent channels — a member with only one
    // (no email on file, or no push subscription) still gets reminded on
    // whichever channel they do have. Both no-op gracefully if unavailable.
    if (member.user?.email) {
      const { subject, html } = paymentReminderEmail(pod, { cycle, dueDate: cycleDue })
      await sendEmail({ to: member.user.email, subject, html })
    }

    if (member.user_id) {
      await sendPushToUser(supabase, member.user_id, {
        title: `${pod.name} — payment due soon`,
        body:  `Cycle ${cycle} is due ${new Date(cycleDue).toLocaleDateString()}. Don't miss it — a late payment slashes your collateral.`,
        podId: pod.id,
      })
    }
  }
}

async function slashMember({ supabase, pod, member, escrowWallet, env }) {
  const podId        = pod.id
  const memberUserId = member.user_id
  const cycle        = pod.current_cycle

  // Already slashed?
  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('pod_id', podId)
    .eq('user_id', memberUserId)
    .eq('cycle', cycle)
    .eq('method', 'collateral_slash')
    .maybeSingle()

  if (existing) return { skipped: true, reason: 'already slashed' }

  // Paid?
  const { data: paid } = await supabase
    .from('payments')
    .select('id')
    .eq('pod_id', podId)
    .eq('user_id', memberUserId)
    .eq('cycle', cycle)
    .in('status', ['CONFIRMED', 'PENDING'])
    .maybeSingle()

  if (paid) return { skipped: true, reason: 'already paid' }

  // Find payout recipient
  const recipient = pod.pod_members?.find(m => m.payout_slot === cycle)
  if (!recipient?.user?.wallet_address) {
    return { skipped: true, reason: 'no payout recipient found' }
  }

  const amount = pod.contribution_amount

  const payment = {
    TransactionType: 'Payment',
    Account:         escrowWallet.address,
    Destination:     recipient.user.wallet_address,
    Amount:          xrpToDrops(String(amount)),
  }

  const client = new Client(NODES[env] ?? NODES.dev)
  await client.connect()
  const prepared = await client.autofill(payment)
  const signed   = escrowWallet.sign(prepared)
  const result   = await client.submitAndWait(signed.tx_blob)
  await client.disconnect()

  const txHash = result.result.hash

  await Promise.all([
    supabase.from('payments').insert({
      pod_id:  podId,
      user_id: memberUserId,
      cycle,
      amount,
      token:   pod.token,
      chain:   'XRPL',
      method:  'collateral_slash',
      tx_hash: txHash,
      status:  'CONFIRMED',
      paid_at: new Date().toISOString(),
    }),
    supabase.from('pod_members')
      .update({ status: 'DEFAULTED' })
      .eq('id', member.id),
  ])

  if (member.user?.email) {
    const { subject, html } = overdueSlashEmail(pod, { cycle, amount, token: pod.token })
    await sendEmail({ to: member.user.email, subject, html })
  }

  if (memberUserId) {
    await sendPushToUser(supabase, memberUserId, {
      title: `${pod.name} — collateral slashed`,
      body:  `You missed cycle ${cycle}. ${amount} ${pod.token} was taken from your collateral and sent to this cycle's recipient.`,
      podId: pod.id,
    })
  }

  return { slashed: true, txHash, sentTo: recipient.user.wallet_address, amount }
}

async function expireStalePods(supabase) {
  const { data: stale, error } = await supabase
    .from('pods')
    .select('id, name')
    .eq('status', 'OPEN')
    .lt('expires_at', new Date().toISOString())

  if (error) {
    console.error('[check-overdue] Failed to fetch stale pods:', error.message)
    return 0
  }
  if (!stale?.length) return 0

  const { error: updateErr } = await supabase
    .from('pods')
    .update({ status: 'EXPIRED' })
    .in('id', stale.map(p => p.id))

  if (updateErr) {
    console.error('[check-overdue] Failed to mark pods EXPIRED:', updateErr.message)
    return 0
  }

  console.log(`[check-overdue] Expired ${stale.length} pod(s): ${stale.map(p => p.name).join(', ')}`)
  return stale.length
}

export const handler = async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  console.log('[check-overdue] Starting scan…')

  const expiredCount = await expireStalePods(supabase)

  // Fetch all active XRPL pods
  const { data: pods, error } = await supabase
    .from('pods')
    .select(`
      id, chain, token, contribution_amount, status, env,
      current_cycle, cycle_started_at, cycle_frequency_days,
      pod_members (
        id, user_id, payout_slot, status,
        user:users ( id, wallet_address, email )
      )
    `)
    .eq('chain', 'XRPL')
    .eq('status', 'ACTIVE')

  if (error) {
    console.error('[check-overdue] Failed to fetch pods:', error.message)
    return { statusCode: 500, body: error.message }
  }

  const results = []

  for (const pod of pods ?? []) {
    const cycleDue = new Date(pod.cycle_started_at).getTime() + cycleMs(pod)

    if (Date.now() < cycleDue) {
      // Not yet overdue — send a "payment due soon" reminder to unpaid members
      // once the due date falls inside the reminder window.
      if (cycleDue - Date.now() <= REMINDER_WINDOW_MS) {
        await sendDueSoonReminders({ supabase, pod, cycleDue })
      }
      results.push({ podId: pod.id, skipped: true, reason: 'cycle not yet overdue' })
      continue
    }

    // Get escrow
    const { data: escrowRow } = await supabase
      .from('pod_escrows')
      .select('escrow_seed')
      .eq('pod_id', pod.id)
      .single()

    if (!escrowRow?.escrow_seed) {
      results.push({ podId: pod.id, skipped: true, reason: 'no escrow' })
      continue
    }

    const env          = pod.env ?? 'dev'
    const escrowWallet = Wallet.fromSeed(escrowRow.escrow_seed)

    // Check each active member
    for (const member of pod.pod_members ?? []) {
      if (member.status === 'DEFAULTED') continue   // already defaulted, skip

      try {
        const r = await slashMember({ supabase, pod, member, escrowWallet, env })
        results.push({ podId: pod.id, memberUserId: member.user_id, ...r })
      } catch (e) {
        results.push({ podId: pod.id, memberUserId: member.user_id, error: e.message })
      }
    }

    // Advance cycle if all members are now accounted for
    const { count: confirmedCount } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('pod_id', pod.id)
      .eq('cycle', pod.current_cycle)
      .eq('status', 'CONFIRMED')

    if (confirmedCount >= pod.pod_members.length) {
      const nextCycle   = pod.current_cycle + 1
      const totalCycles = pod.pod_members.length
      const done        = nextCycle > totalCycles
      await supabase
        .from('pods')
        .update(done
          ? { status: 'COMPLETED', completed_at: new Date().toISOString() }
          : { current_cycle: nextCycle, cycle_started_at: new Date().toISOString() }
        )
        .eq('id', pod.id)
      console.log(`[check-overdue] Pod ${pod.id} cycle advanced to ${done ? 'COMPLETED' : nextCycle}`)
    }
  }

  const slashed = results.filter(r => r.slashed).length
  const skipped = results.filter(r => r.skipped).length
  const errors  = results.filter(r => r.error).length

  console.log(`[check-overdue] Done — expired: ${expiredCount}, slashed: ${slashed}, skipped: ${skipped}, errors: ${errors}`)
  console.log('[check-overdue] Details:', JSON.stringify(results, null, 2))

  return { statusCode: 200, body: JSON.stringify({ expiredCount, slashed, skipped, errors, results }) }
}
