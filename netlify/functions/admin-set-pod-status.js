/**
 * Netlify Function: admin-set-pod-status
 *
 * POST /.netlify/functions/admin-set-pod-status
 * Body: { podId: string, status: 'CANCELLED' | 'COMPLETED' }
 * Headers: Authorization: Bearer <supabase_access_token>
 *
 * Validates admin session, then updates pods.status. The only way an ACTIVE pod's
 * status changes now that anon/authenticated write grants on `pods` have been
 * revoked (see supabase/migrations/028_lock_fund_moving_tables.sql) — a pod with
 * real collateral locked in escrow can no longer be cancelled by anyone who just
 * knows its id. (An OPEN pod with no members yet stays self-service via
 * pod-cancel-open.js — nothing to protect there.)
 *
 * Required env vars (no VITE_ prefix):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const ALLOWED_STATUSES = ['CANCELLED', 'COMPLETED']

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
      .select('id')
      .eq('email', user.email)
      .single()

    if (!adminRow) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Not an admin' }) }
    }

    const { podId, status } = JSON.parse(event.body ?? '{}')
    if (!podId || !ALLOWED_STATUSES.includes(status)) {
      return { statusCode: 400, body: JSON.stringify({ error: `podId required, status must be one of ${ALLOWED_STATUSES.join(', ')}` }) }
    }

    const { data: pod } = await supabase.from('pods').select('id, status').eq('id', podId).single()
    if (!pod) return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }

    const extra = status === 'CANCELLED'
      ? {}
      : { completed_at: new Date().toISOString() }

    const { error: updateErr } = await supabase
      .from('pods')
      .update({ status, ...extra })
      .eq('id', podId)

    if (updateErr) return { statusCode: 500, body: JSON.stringify({ error: updateErr.message }) }

    console.log(`[admin-set-pod-status] admin ${user.email} set pod ${podId} -> ${status}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    }

  } catch (e) {
    console.error('[admin-set-pod-status]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
