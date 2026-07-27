/**
 * Netlify Function: set-kyc-required
 *
 * POST /.netlify/functions/set-kyc-required
 * Body: { required: boolean }
 * Headers: Authorization: Bearer <supabase_access_token>
 *
 * Sets whether KYC approval is required to create/join a tanda
 * (platform_settings key 'kyc_required'). Writes to platform_settings are
 * service_role-only by RLS (migration 021) — this function is the only path
 * that can change it, and only for a verified active admin. Mirrors
 * set-platform-env.js / set-creation-fee.js.
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

    const { required } = JSON.parse(event.body ?? '{}')
    if (typeof required !== 'boolean') {
      return { statusCode: 400, body: JSON.stringify({ error: 'required must be a boolean' }) }
    }

    const { error: upsertErr } = await supabase
      .from('platform_settings')
      .upsert({ key: 'kyc_required', value: String(required), updated_at: new Date().toISOString() }, { onConflict: 'key' })

    if (upsertErr) {
      return { statusCode: 500, body: JSON.stringify({ error: upsertErr.message }) }
    }

    console.log(`[set-kyc-required] ${user.email} set kyc_required to ${required}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, required }),
    }

  } catch (e) {
    console.error('[set-kyc-required]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
