/**
 * Shared Telegram DM sending for Netlify functions.
 *
 * Required env var (Netlify dashboard — no VITE_ prefix):
 *   TELEGRAM_BOT_TOKEN
 *
 * If TELEGRAM_BOT_TOKEN isn't set, sendTelegramToUser() no-ops instead of
 * throwing — same "degrade gracefully" pattern as lib/email.js / lib/push.js,
 * so a missing Telegram config never breaks the rest of a request.
 *
 * Node 20's global fetch is used directly — no SDK dependency, matching
 * Telegram's plain HTTP Bot API.
 */

const API_BASE = 'https://api.telegram.org'

function ensureConfigured() {
  return !!process.env.TELEGRAM_BOT_TOKEN
}

/**
 * Sends a plain-text Telegram DM to whatever chat_id is on file for a user.
 * No `parse_mode` — pod names are user-supplied and could contain characters
 * (_, *, `, [) that break Telegram's Markdown parser and fail the whole send;
 * not worth the escaping complexity for what's just emphasis styling.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} text
 */
export async function sendTelegramToUser(supabase, userId, text) {
  if (!ensureConfigured()) return { skipped: true, reason: 'TELEGRAM_BOT_TOKEN not set' }

  const { data: user } = await supabase
    .from('users')
    .select('telegram_chat_id')
    .eq('id', userId)
    .maybeSingle()

  const chatId = user?.telegram_chat_id
  if (!chatId) return { skipped: true, reason: 'no telegram linked' }

  return sendTelegramMessage(supabase, userId, chatId, text)
}

/**
 * Lower-level send, used directly by telegram-webhook.js for the one-off
 * "you're connected!" confirmation (not tied to a user row lookup — the
 * webhook already has the chat_id from the incoming update).
 */
export async function sendTelegramMessage(supabase, userId, chatId, text) {
  if (!ensureConfigured()) return { skipped: true, reason: 'TELEGRAM_BOT_TOKEN not set' }

  try {
    const res  = await fetch(`${API_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text }),
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      // 403 = the user blocked the bot — stop retrying a dead chat_id, same
      // idea as push.js deleting a subscription on 404/410.
      if (json.error_code === 403 && userId && supabase) {
        await supabase.from('users').update({ telegram_chat_id: null }).eq('id', userId)
        return { status: 'unlinked' }
      }
      console.error(`[telegram] send failed to chat ${chatId}:`, json.description ?? res.status)
      return { status: 'error', error: json.description ?? `HTTP ${res.status}` }
    }

    return { status: 'sent' }
  } catch (e) {
    console.error(`[telegram] send threw for chat ${chatId}:`, e.message)
    return { status: 'error', error: e.message }
  }
}
