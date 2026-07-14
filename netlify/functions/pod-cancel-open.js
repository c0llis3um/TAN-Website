/**
 * Netlify Function: pod-cancel-open
 *
 * POST /.netlify/functions/pod-cancel-open
 * Body: { podId: string }
 *
 * Self-service organizer cancel, no auth required — deliberately restricted to
 * pods still in OPEN status with zero members, so there's no collateral in escrow
 * to protect and nothing to steal by spoofing the caller. Cancelling a pod with
 * real money at stake requires admin-set-pod-status.js instead. The only way
 * `pods.status` changes for the OPEN case now that anon/authenticated write grants
 * on `pods` have been revoked (see supabase/migrations/028_lock_fund_moving_tables.sql).
 *
 * Required env vars (no VITE_ prefix):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { rateLimit } from './lib/rateLimit.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const limited = await rateLimit(supabase, event, 'pod-cancel-open', { max: 10, windowSeconds: 600 })
  if (limited) return limited

  try {
    const { podId } = JSON.parse(event.body ?? '{}')
    if (!podId) return { statusCode: 400, body: JSON.stringify({ error: 'podId required' }) }

    const { data: pod } = await supabase
      .from('pods')
      .select('id, status, pod_members(id)')
      .eq('id', podId)
      .single()

    if (!pod) return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    if (pod.status !== 'OPEN') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Only an OPEN pod can be cancelled this way — contact an admin' }) }
    }
    if ((pod.pod_members?.length ?? 0) > 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Pod already has members — contact an admin instead' }) }
    }

    const { error } = await supabase
      .from('pods')
      .update({ status: 'CANCELLED' })
      .eq('id', podId)

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    }

  } catch (e) {
    console.error('[pod-cancel-open]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
