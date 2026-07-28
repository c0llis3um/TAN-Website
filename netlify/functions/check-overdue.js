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
 *
 * Required env vars (no VITE_ prefix) include ESCROW_SEED_ENCRYPTION_KEY
 * alongside SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js'
import { Client, Wallet, xrpToDrops } from 'xrpl'
import { paymentReminderEmail, overdueSlashEmail, sendEmail } from './lib/email.js'
import { paymentReminderTelegramText, overdueSlashTelegramText } from './lib/telegramMessages.js'
import { sendPushToUser } from './lib/push.js'
import { sendTelegramToUser } from './lib/telegram.js'
import { decryptSeed } from './lib/crypto.js'
import { rateLimit } from './lib/rateLimit.js'
import { autoWithdrawVaultIfNeeded } from './lib/vaultWithdraw.js'

const NODES = {
  dev:  'wss://testnet.xrpl-labs.com',
  live: 'wss://xrplcluster.com',
}

const RLUSD_ISSUER = {
  dev:  'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV',
  live: '',
}

const RLUSD_HEX = '524C555344000000000000000000000000000000'

// How long before a cycle's due date to send the "payment due soon" reminder.
const REMINDER_WINDOW_MS = 2 * 864e5 // 2 days

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

/** Same reuse-prevention as pod-join.js / pod-record-payment.js — a hash already used as proof elsewhere can't count again. */
async function isTxHashAlreadyUsed(supabase, txHash) {
  const [{ count: memberCount }, { count: paymentCount }] = await Promise.all([
    supabase.from('pod_members').select('id', { count: 'exact', head: true }).eq('collateral_tx', txHash),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('tx_hash', txHash),
  ])
  return (memberCount ?? 0) > 0 || (paymentCount ?? 0) > 0
}

/**
 * Scans fromAddress's own recent payment history for a qualifying, not-already-used
 * payment to toAddress — used so a member who paid a cycle directly (e.g. ahead of
 * time, without ever visiting the Pay page to register it) doesn't get wrongly
 * slashed just because no `payments` row exists yet for that cycle.
 */
async function findQualifyingPayment(supabase, fromAddress, toAddress, expectedAmount, token, env, sinceMs) {
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

      // XRPL close times are seconds since the Ripple Epoch (2000-01-01T00:00:00Z).
      // A payment sent before this cycle started can't count toward it (e.g. an
      // unrelated past transfer between the same two wallets) — see the matching
      // note in pod-record-payment.js.
      if (tx.date == null || (tx.date + 946684800) * 1000 < sinceMs) continue

      const delivered = entry.meta?.delivered_amount ?? entry.meta?.DeliveredAmount
      if (!deliveredMatchesToken(delivered, token, env)) continue
      const deliveredValue = deliveredAmountToNumber(delivered)
      if (deliveredValue < expectedAmount - 1e-6) continue

      const candidateHash = entry.hash ?? tx.hash
      if (!candidateHash) continue
      if (await isTxHashAlreadyUsed(supabase, candidateHash)) continue

      return { txHash: candidateHash, amount: deliveredValue }
    }
    return null
  } catch {
    return null
  } finally {
    await client.disconnect()
  }
}

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
      await sendTelegramToUser(supabase, member.user_id, paymentReminderTelegramText(pod, { cycle, dueDate: cycleDue }))
    }
  }
}

async function slashMember({ supabase, pod, member, escrowWallet, env }) {
  const podId        = pod.id
  const memberUserId = member.user_id
  const cycle        = pod.current_cycle

  // Find payout recipient — needed both for the paid-check below (on-chain
  // scan target) and for where the slash payment goes if we do end up
  // slashing. Payout slots are assigned once at pod-fill and never
  // reassigned — if the member holding this cycle's slot has since
  // defaulted, redirect to the organizer instead of sending real money to
  // an already-excluded member (matches pod-record-payment.js/Pay/index.jsx).
  const slotRecipient = pod.pod_members?.find(m => m.payout_slot === cycle)
  if (!slotRecipient?.user?.wallet_address) {
    return { skipped: true, reason: 'no payout recipient found' }
  }
  const recipientIsActive = slotRecipient.status === 'ACTIVE'
  const recipientUserId   = recipientIsActive ? slotRecipient.user_id : pod.organizer?.id
  const recipientWallet   = recipientIsActive ? slotRecipient.user.wallet_address : pod.organizer?.wallet_address
  if (!recipientWallet) {
    return { skipped: true, reason: 'no payout recipient found (organizer wallet missing)' }
  }

  // This cycle's recipient never owes themselves a payment — nothing to
  // check or slash. Previously unguarded: a recipient who never visited the
  // Pay page to record their no-op 'self-recipient' payment would otherwise
  // look unpaid here and get wrongly slashed — sending a "penalty" payment
  // from their own collateral into their own wallet and marking them
  // DEFAULTED for a cycle they'd already received.
  if (recipientUserId === memberUserId) {
    return { skipped: true, reason: "member is this cycle's recipient" }
  }

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

  // Paid? Check the DB first (the normal case — the member used the Pay
  // button), then fall back to a live on-chain scan before ever slashing.
  const { data: paid } = await supabase
    .from('payments')
    .select('id')
    .eq('pod_id', podId)
    .eq('user_id', memberUserId)
    .eq('cycle', cycle)
    .in('status', ['CONFIRMED', 'PENDING'])
    .maybeSingle()

  if (paid) return { skipped: true, reason: 'already paid' }

  if (member.user?.wallet_address) {
    const sinceMs = new Date(pod.cycle_started_at).getTime()
    const found = await findQualifyingPayment(
      supabase, member.user.wallet_address, recipientWallet, pod.contribution_amount, pod.token, env, sinceMs,
    )
    if (found) {
      const { error: insertErr } = await supabase.from('payments').insert({
        pod_id:  podId,
        user_id: memberUserId,
        cycle,
        amount:  found.amount,
        token:   pod.token,
        chain:   'XRPL',
        method:  'wallet',
        tx_hash: found.txHash,
        status:  'CONFIRMED',
        paid_at: new Date().toISOString(),
      })
      if (!insertErr) {
        return { skipped: true, reason: 'found unrecorded on-chain payment — recorded it instead of slashing', txHash: found.txHash }
      }
      // Insert failed (e.g. a race with the member's own Pay click landing
      // first) — fall through. The "already slashed"/"already paid" checks
      // above already protect against any resulting double-attempt on retry.
    }
  }

  const amount = pod.contribution_amount

  const payment = {
    TransactionType: 'Payment',
    Account:         escrowWallet.address,
    Destination:     recipientWallet,
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
    await sendTelegramToUser(supabase, memberUserId, overdueSlashTelegramText(pod, { cycle, amount, token: pod.token }))
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

export const handler = async (event = {}) => {
  // Netlify's scheduler POSTs a body containing `next_run` for a genuine
  // scheduled invocation. This function auto-slashes real member collateral
  // with no per-caller verification otherwise, so a direct call to its public
  // URL is worth flagging loudly — logged rather than hard-blocked, since
  // getting Netlify's exact invocation contract wrong here would silently
  // disable the daily slash/expiry sweep with no one noticing.
  let isScheduled = false
  try { isScheduled = !!JSON.parse(event.body ?? '{}').next_run } catch { /* not scheduled */ }
  if (!isScheduled) {
    console.warn('[check-overdue] Invoked without a scheduler payload — verify this wasn\'t a direct external call.')
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const limited = await rateLimit(supabase, event, 'check-overdue', { max: 2, windowSeconds: 3600 })
  if (limited) return limited

  console.log('[check-overdue] Starting scan…')

  const expiredCount = await expireStalePods(supabase)

  // Fetch all active XRPL pods
  const { data: pods, error } = await supabase
    .from('pods')
    .select(`
      id, chain, token, contribution_amount, status, env, total_cycles,
      current_cycle, cycle_started_at, cycle_frequency_days,
      organizer:users!organizer_id ( id, wallet_address ),
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
    const escrowWallet = Wallet.fromSeed(decryptSeed(escrowRow.escrow_seed))

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

    // Advance cycle if all still-ACTIVE members are now accounted for. A
    // DEFAULTED member is permanently excluded from paying (skipped above),
    // so comparing against the full pod_members.length would make the pod
    // stuck at this cycle forever once anyone defaults.
    const { count: confirmedCount } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('pod_id', pod.id)
      .eq('cycle', pod.current_cycle)
      .eq('status', 'CONFIRMED')

    const activeMemberCount = pod.pod_members.filter(m => m.status === 'ACTIVE').length

    if (confirmedCount >= activeMemberCount) {
      const nextCycle   = pod.current_cycle + 1
      const done        = nextCycle > pod.total_cycles
      await supabase
        .from('pods')
        .update(done
          ? { status: 'COMPLETED', completed_at: new Date().toISOString() }
          : { current_cycle: nextCycle, cycle_started_at: new Date().toISOString() }
        )
        .eq('id', pod.id)
      console.log(`[check-overdue] Pod ${pod.id} cycle advanced to ${done ? 'COMPLETED' : nextCycle}`)

      // Yield/vault pods: empty the vault back into escrow immediately so
      // members can self-claim without waiting on an admin. No-ops for
      // standard pods.
      if (done) {
        await autoWithdrawVaultIfNeeded({ supabase, podId: pod.id }).catch(e =>
          console.error(`[check-overdue] auto-vault-withdraw threw for pod ${pod.id}:`, e.message),
        )
      }
    }
  }

  const slashed = results.filter(r => r.slashed).length
  const skipped = results.filter(r => r.skipped).length
  const errors  = results.filter(r => r.error).length

  console.log(`[check-overdue] Done — expired: ${expiredCount}, slashed: ${slashed}, skipped: ${skipped}, errors: ${errors}`)
  console.log('[check-overdue] Details:', JSON.stringify(results, null, 2))

  return { statusCode: 200, body: JSON.stringify({ expiredCount, slashed, skipped, errors, results }) }
}
