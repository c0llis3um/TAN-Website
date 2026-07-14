/**
 * rateLimit.js — shared rate limiting for no-auth Netlify functions.
 *
 * Netlify Functions don't share memory across invocations (each may run on a
 * different Lambda instance), so an in-process counter wouldn't work — this
 * calls the check_rate_limit() Postgres function (migration 029) via the
 * caller's own service-role Supabase client, which atomically increments a
 * per-key counter and reports whether the caller is still within the window.
 *
 * Usage (near the top of a handler, after parsing httpMethod but before any
 * real work):
 *
 *   const limited = await rateLimit(supabase, event, 'pod-join', { max: 20, windowSeconds: 300 })
 *   if (limited) return limited   // already a 429 response — just return it
 */

function getClientIp(event) {
  return (
    event.headers['x-nf-client-connection-ip'] ??
    event.headers['client-ip'] ??
    (event.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ??
    'unknown'
  ) || 'unknown'
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase — service-role client
 * @param {object} event — the Netlify Function event
 * @param {string} name — this function's name, used as part of the rate-limit key
 * @param {{ max: number, windowSeconds: number }} opts
 * @returns {Promise<null|{statusCode: number, body: string}>} null if within limit,
 *   otherwise a ready-to-return 429 response.
 */
export async function rateLimit(supabase, event, name, { max, windowSeconds }) {
  const ip  = getClientIp(event)
  const key = `${name}:${ip}`

  const { data: withinLimit, error } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max: max,
  })

  if (error) {
    // Fail open — a rate-limit check failing shouldn't take down the whole
    // endpoint. Logged so a persistent failure (e.g. migration not run yet) is
    // still visible.
    console.error(`[rateLimit] check failed for ${key}:`, error.message)
    return null
  }

  if (!withinLimit) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(windowSeconds) },
      body: JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    }
  }

  return null
}
