/**
 * Netlify Function: admin-force-advance-cycle
 *
 * POST /.netlify/functions/admin-force-advance-cycle
 * Body: { podId: string }
 * Headers: Authorization: Bearer <supabase_access_token>
 *
 * Marks every ACTIVE member who hasn't paid the current cycle as DEFAULTED
 * (recording a 0-amount 'admin_skip' payment so the cycle's paid-count still
 * adds up correctly), then advances the pod to the next cycle or COMPLETED.
 *
 * Replaces adminForceAdvanceCycle() in src/lib/db.js, which wrote directly to
 * pod_members/payments/pods from the client — those write grants are now
 * service-role only (migration 028_lock_fund_moving_tables.sql).
 *
 * Required env vars (no VITE_ prefix):
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
      .select('id')
      .eq('email', user.email)
      .single()

    if (!adminRow) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Not an admin' }) }
    }

    const { podId } = JSON.parse(event.body ?? '{}')
    if (!podId) return { statusCode: 400, body: JSON.stringify({ error: 'podId required' }) }

    // ── 1. Fetch pod + members ────────────────────────────────────
    const { data: pod } = await supabase
      .from('pods')
      .select(`id, size, current_cycle, total_cycles, status, token, chain, pod_members ( id, user_id, status )`)
      .eq('id', podId)
      .single()

    if (!pod)                    return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    if (pod.status !== 'ACTIVE') return { statusCode: 400, body: JSON.stringify({ error: 'Pod is not active' }) }

    // ── 2. Find unpaid ACTIVE members for this cycle ────────────────
    const { data: paid } = await supabase
      .from('payments')
      .select('user_id')
      .eq('pod_id', podId)
      .eq('cycle', pod.current_cycle)
      .eq('status', 'CONFIRMED')

    const paidIds = new Set((paid ?? []).map(p => p.user_id))
    const unpaid  = (pod.pod_members ?? []).filter(m => m.status === 'ACTIVE' && !paidIds.has(m.user_id))

    // ── 3. Record a 0-amount admin_skip payment + mark DEFAULTED ────
    if (unpaid.length > 0) {
      const results = await Promise.all(unpaid.flatMap(m => [
        supabase.from('payments').upsert({
          pod_id:  podId,
          user_id: m.user_id,
          cycle:   pod.current_cycle,
          amount:  0,
          token:   pod.token,
          chain:   pod.chain,
          method:  'admin_skip',
          status:  'CONFIRMED',
          paid_at: new Date().toISOString(),
        }, { onConflict: 'pod_id,user_id,cycle' }),
        supabase.from('pod_members').update({ status: 'DEFAULTED' }).eq('id', m.id),
      ]))

      const failed = results.filter(r => r.error)
      if (failed.length > 0) {
        return { statusCode: 500, body: JSON.stringify({ error: `Failed to update ${failed.length} member record(s): ${failed[0].error.message}` }) }
      }
    }

    // ── 4. Advance the cycle ─────────────────────────────────────────
    const nextCycle = pod.current_cycle + 1
    const done      = nextCycle > pod.total_cycles

    const { data: updatedPod, error: updateErr } = await supabase
      .from('pods')
      .update(done
        ? { status: 'COMPLETED', completed_at: new Date().toISOString() }
        : { current_cycle: nextCycle, cycle_started_at: new Date().toISOString() },
      )
      .eq('id', podId)
      .select('id, status, current_cycle')
      .single()

    if (updateErr) {
      return { statusCode: 500, body: JSON.stringify({ error: updateErr.message }) }
    }

    console.log(`[admin-force-advance-cycle] admin ${user.email} force-advanced pod ${podId} — defaulted ${unpaid.length} member(s)`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, defaultedCount: unpaid.length, pod: updatedPod }),
    }

  } catch (e) {
    console.error('[admin-force-advance-cycle]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
