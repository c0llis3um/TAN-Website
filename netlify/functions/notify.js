/**
 * Netlify Function: notify
 *
 * POST /.netlify/functions/notify
 * Body: { event: 'pod_created' | 'pod_joined' | 'payment_received', podId, userId, cycle? }
 *
 * Fires a transactional email for a pod lifecycle event. Called by the client
 * right after the corresponding DB write (createPod, joinPod, recordPayment)
 * succeeds. Best-effort: a failed send never fails the caller's flow, so this
 * function always returns 200 once the event/user/pod are validated.
 *
 * userId must be the organizer or a member of podId — prevents an arbitrary
 * caller from using this endpoint to spam an unrelated user's inbox.
 */

import { createClient } from '@supabase/supabase-js'
import { podCreatedEmail, podJoinedEmail, paymentReceivedEmail, sendEmail } from './lib/email.js'

const EVENTS = ['pod_created', 'pod_joined', 'payment_received']

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  try {
    const { event: notifyEvent, podId, userId, cycle, amount, token } = JSON.parse(event.body ?? '{}')

    if (!EVENTS.includes(notifyEvent)) {
      return { statusCode: 400, body: JSON.stringify({ error: `event must be one of ${EVENTS.join(', ')}` }) }
    }
    if (!podId || !userId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'podId and userId required' }) }
    }

    const { data: pod } = await supabase
      .from('pods')
      .select('id, name, chain, token, contribution_amount, size, organizer_id, pod_members ( user_id )')
      .eq('id', podId)
      .maybeSingle()

    if (!pod) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Pod not found' }) }
    }

    const isOrganizer = pod.organizer_id === userId
    const isMember    = pod.pod_members?.some(m => m.user_id === userId)
    if (!isOrganizer && !isMember) {
      return { statusCode: 403, body: JSON.stringify({ error: 'userId is not associated with this pod' }) }
    }

    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle()

    let template
    if (notifyEvent === 'pod_created')      template = podCreatedEmail(pod)
    if (notifyEvent === 'pod_joined')       template = podJoinedEmail(pod)
    if (notifyEvent === 'payment_received') template = paymentReceivedEmail(pod, { amount, token: token ?? pod.token, cycle })

    const result = await sendEmail({ to: user?.email, ...template })

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) }

  } catch (e) {
    console.error('[notify]', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
