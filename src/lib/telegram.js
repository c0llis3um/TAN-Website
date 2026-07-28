/**
 * Telegram DM linking — pure navigation, no Supabase call here at all. The
 * actual link (writing users.telegram_chat_id) happens entirely server-side
 * in netlify/functions/telegram-webhook.js once the user hits "Start" on the
 * bot, so this file just builds and opens the deep link.
 *
 * Set VITE_TELEGRAM_BOT_USERNAME in .env — safe to expose, it's public in the
 * deep link URL regardless.
 */

export function getTelegramBotUsername() {
  return (import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '').trim()
}

export function connectTelegram(userId) {
  const username = getTelegramBotUsername()
  if (!username || !userId) return false
  window.open(`https://t.me/${username}?start=${userId}`, '_blank')
  return true
}
