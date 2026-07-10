/**
 * Shared email sending for Netlify functions — Resend.
 *
 * Required env var (Netlify dashboard — no VITE_ prefix):
 *   RESEND_API_KEY
 * Optional:
 *   EMAIL_FROM   defaults to 'DeFi Tanda <notifications@defitanda.app>'
 *
 * If RESEND_API_KEY is unset, send() logs and no-ops instead of throwing —
 * lets the rest of a request (pod creation, payment recording, etc.) succeed
 * even if email isn't configured yet in this environment.
 */

import { Resend } from 'resend'

const FROM = process.env.EMAIL_FROM ?? 'DeFi Tanda <notifications@defitanda.app>'

let resend = null
function client() {
  if (!process.env.RESEND_API_KEY) return null
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY)
  return resend
}

export async function sendEmail({ to, subject, html }) {
  if (!to) return { skipped: true, reason: 'no recipient email on file' }

  const c = client()
  if (!c) {
    console.warn(`[email] RESEND_API_KEY not set — skipping send to ${to}: ${subject}`)
    return { skipped: true, reason: 'RESEND_API_KEY not configured' }
  }

  const { data, error } = await c.emails.send({ from: FROM, to, subject, html })
  if (error) {
    console.error(`[email] send failed to ${to}:`, error)
    return { skipped: false, error: error.message ?? String(error) }
  }
  return { skipped: false, id: data?.id }
}

function layout(bodyHtml) {
  return `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
      <h2 style="color: #0ea5e9; margin-bottom: 4px;">DeFi Tanda</h2>
      ${bodyHtml}
      <p style="font-size: 12px; color: #94a3b8; margin-top: 32px;">
        You're receiving this because you have an active tanda on DeFi Tanda.
      </p>
    </div>
  `
}

export function podCreatedEmail(pod) {
  return {
    subject: `Your tanda "${pod.name}" is live`,
    html: layout(`
      <p>Your tanda <strong>${pod.name}</strong> has been created.</p>
      <ul>
        <li>Contribution: ${pod.contribution_amount} ${pod.token} per cycle</li>
        <li>Group size: ${pod.size} members</li>
        <li>Chain: ${pod.chain}</li>
      </ul>
      <p>Share the invite link with your group to start filling spots.</p>
    `),
  }
}

export function podJoinedEmail(pod) {
  return {
    subject: `You joined "${pod.name}"`,
    html: layout(`
      <p>You're in! You've joined <strong>${pod.name}</strong>.</p>
      <ul>
        <li>Contribution: ${pod.contribution_amount} ${pod.token} per cycle</li>
      </ul>
      <p>We'll email you before each payment is due.</p>
    `),
  }
}

export function paymentReceivedEmail(pod, { amount, token, cycle }) {
  return {
    subject: `Payment confirmed — ${pod.name}, cycle ${cycle}`,
    html: layout(`
      <p>Your payment of <strong>${amount} ${token}</strong> for cycle ${cycle} of
      <strong>${pod.name}</strong> has been recorded.</p>
    `),
  }
}

export function paymentReminderEmail(pod, { cycle, dueDate }) {
  return {
    subject: `Payment due soon — ${pod.name}`,
    html: layout(`
      <p>Your contribution of <strong>${pod.contribution_amount} ${pod.token}</strong>
      for cycle ${cycle} of <strong>${pod.name}</strong> is due
      ${dueDate ? `on ${new Date(dueDate).toLocaleDateString()}` : 'soon'}.</p>
      <p>Pay on time to avoid your collateral being slashed.</p>
    `),
  }
}

export function overdueSlashEmail(pod, { cycle, amount, token }) {
  return {
    subject: `Missed payment — collateral slashed for "${pod.name}"`,
    html: layout(`
      <p>You missed the cycle ${cycle} payment for <strong>${pod.name}</strong>,
      so <strong>${amount} ${token}</strong> of your collateral was used to keep
      the payout on schedule for the group.</p>
      <p>You've been marked as defaulted for this pod.</p>
    `),
  }
}
