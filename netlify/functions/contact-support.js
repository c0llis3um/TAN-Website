/**
 * Netlify Function: contact-support
 *
 * POST /.netlify/functions/contact-support
 * Body: { message: string, walletAddress?: string, podId?: string, podName?: string, txHash?: string }
 *
 * Emails SUPPORT_EMAIL (via Resend) with the user's message plus whatever
 * payment/pod context the calling page had on hand — e.g. the "Something
 * wrong with your payment?" button on the Pay confirmation screen, so a
 * report always comes with the wallet/pod/tx it's about instead of a bare
 * message support has to chase context down for.
 *
 * Required env vars (no VITE_ prefix):
 *   RESEND_API_KEY
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (rate limiting only)
 * Optional:
 *   SUPPORT_EMAIL   defaults to the address in EMAIL_FROM's domain owner
 */

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './lib/email.js'
import { rateLimit } from './lib/rateLimit.js'

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? 'joelalcan@gmail.com'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const limited = await rateLimit(supabase, event, 'contact-support', { max: 5, windowSeconds: 3600 })
  if (limited) return limited

  try {
    const { message, walletAddress, podId, podName, txHash } = JSON.parse(event.body ?? '{}')
    if (!message?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'message is required' }) }
    }

    const html = `
      <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
        <h2 style="color: #0ea5e9; margin-bottom: 4px;">New support request</h2>
        <p style="white-space: pre-wrap;">${escapeHtml(message.trim())}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 13px; color: #475569;">
          ${walletAddress ? `<strong>Wallet:</strong> ${escapeHtml(walletAddress)}<br/>` : ''}
          ${podName      ? `<strong>Pod:</strong> ${escapeHtml(podName)} ${podId ? `(${escapeHtml(podId)})` : ''}<br/>` : ''}
          ${txHash       ? `<strong>Tx:</strong> ${escapeHtml(txHash)}<br/>` : ''}
        </p>
      </div>
    `

    const result = await sendEmail({
      to:      SUPPORT_EMAIL,
      subject: `Support request${podName ? ` — ${podName}` : ''}`,
      html,
    })

    if (result.error) {
      return { statusCode: 502, body: JSON.stringify({ error: result.error }) }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, skipped: result.skipped ?? false }),
    }

  } catch (e) {
    console.error('[contact-support]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
