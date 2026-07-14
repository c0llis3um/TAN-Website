/**
 * Netlify Function: pod-mark-failed
 *
 * POST /.netlify/functions/pod-mark-failed
 * Body: { podId: string }
 *
 * Moves a pod that never finished deploying (escrow creation or creation-fee
 * payment failed mid-flow) to FAILED. No auth beyond the state check below — a
 * pod with no escrow wallet yet has no funds in it, so this is a no-stakes
 * "give up on my broken pod creation" action. The only way `pods.status` changes
 * for this case now that anon/authenticated write grants on `pods` have been
 * revoked (see supabase/migrations/028_lock_fund_moving_tables.sql).
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

  const limited = await rateLimit(supabase, event, 'pod-mark-failed', { max: 10, windowSeconds: 600 })
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

    // Only a pod that hasn't finished deploying, and that nobody has joined (and
    // possibly deposited real collateral into) yet, can be abandoned this way —
    // otherwise this must go through admin-set-pod-status.js instead.
    if (pod.status !== 'OPEN') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Only a pod still in OPEN status can be marked failed this way' }) }
    }
    if ((pod.pod_members?.length ?? 0) > 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Pod already has members — contact an admin instead' }) }
    }

    const { error } = await supabase
      .from('pods')
      .update({ status: 'FAILED' })
      .eq('id', podId)

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    }

  } catch (e) {
    console.error('[pod-mark-failed]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
