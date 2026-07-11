/**
 * Shared Web Push sending for Netlify functions.
 *
 * Required env vars (Netlify dashboard — no VITE_ prefix on the private one):
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT   e.g. mailto:support@defitanda.app
 *
 * If the VAPID keys aren't set, sendPushToUser() no-ops instead of throwing —
 * same "degrade gracefully" pattern as lib/email.js, so a missing push
 * config never breaks the rest of a request (e.g. check-overdue's email
 * reminders still go out even if push isn't configured yet).
 */

import webpush from 'web-push'

let configured = false
function ensureConfigured() {
  if (configured) return true
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:support@defitanda.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
  configured = true
  return true
}

/**
 * Sends a push notification to every subscription on file for a user.
 * Subscriptions the push service reports as gone (404/410) are deleted so
 * we stop retrying dead endpoints.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ title: string, body: string, url?: string, podId?: string }} payload
 */
export async function sendPushToUser(supabase, userId, payload) {
  if (!ensureConfigured()) return { skipped: true, reason: 'VAPID keys not set' }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, keys_p256dh, keys_auth')
    .eq('user_id', userId)

  if (!subs?.length) return { skipped: true, reason: 'no subscriptions on file' }

  const results = []
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
        JSON.stringify(payload),
      )
      results.push({ id: sub.id, status: 'sent' })
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        results.push({ id: sub.id, status: 'expired_removed' })
      } else {
        results.push({ id: sub.id, status: 'error', error: e.message })
      }
    }
  }
  return { results }
}
