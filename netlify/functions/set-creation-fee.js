/**
 * Netlify Function: set-creation-fee
 *
 * POST /.netlify/functions/set-creation-fee
 * Body: { feeUsd: number }
 * Headers: Authorization: Bearer <supabase_access_token>
 *
 * Sets the flat USD creation fee charged to organizers for live XRPL pods
 * (platform_settings key 'creation_fee_usd', read by CreatePod.jsx). Writes to
 * platform_settings are service_role-only by RLS (migration 021) — this
 * function is the only path that can change it, and only for a verified
 * active admin. Mirrors set-platform-env.js.
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

    const { feeUsd } = JSON.parse(event.body ?? '{}')
    const parsed = Number(feeUsd)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'feeUsd must be a positive number' }) }
    }

    const { error: upsertErr } = await supabase
      .from('platform_settings')
      .upsert({ key: 'creation_fee_usd', value: String(parsed), updated_at: new Date().toISOString() }, { onConflict: 'key' })

    if (upsertErr) {
      return { statusCode: 500, body: JSON.stringify({ error: upsertErr.message }) }
    }

    console.log(`[set-creation-fee] ${user.email} set creation fee to $${parsed}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, feeUsd: parsed }),
    }

  } catch (e) {
    console.error('[set-creation-fee]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
