/**
 * Netlify Function: set-platform-env
 *
 * POST /.netlify/functions/set-platform-env
 * Body: { env: 'dev' | 'live' }
 * Headers: Authorization: Bearer <supabase_access_token>
 *
 * Flips the site-wide env flag (platform_settings.env), which every
 * visitor's browser reads on load (see App.jsx). Writes to
 * platform_settings are service_role-only by RLS (migration 021) — this
 * function is the only path that can change it, and only for a verified
 * active admin.
 *
 * Required env vars (Netlify dashboard — NO VITE_ prefix):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const authHeader  = event.headers['authorization'] ?? ''
  const accessToken = authHeader.replace('Bearer ', '').trim()
  if (!accessToken) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing authorization token' }) }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken)
    if (authErr || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }
    }

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('id, active')
      .eq('email', user.email)
      .single()

    if (!adminRow?.active) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Not an admin' }) }
    }

    const { env } = JSON.parse(event.body ?? '{}')
    if (env !== 'dev' && env !== 'live') {
      return { statusCode: 400, body: JSON.stringify({ error: "env must be 'dev' or 'live'" }) }
    }

    const { error: upsertErr } = await supabase
      .from('platform_settings')
      .upsert({ key: 'env', value: env, updated_at: new Date().toISOString() }, { onConflict: 'key' })

    if (upsertErr) {
      return { statusCode: 500, body: JSON.stringify({ error: upsertErr.message }) }
    }

    console.log(`[set-platform-env] ${user.email} switched site-wide env to ${env}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, env }),
    }

  } catch (e) {
    console.error('[set-platform-env]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
