/**
 * db.js — typed query helpers
 *
 * All functions return { data, error } (Supabase convention).
 * The frontend uses ANON key + RLS.
 * Admin server routes use SERVICE_ROLE key (never in this file).
 */
import supabase from './supabase'

// In dev mode cycle_frequency_days is treated as HOURS, not days, so testing doesn't take weeks.
export function cycleMs(pod, env) {
  const n = pod.cycle_frequency_days ?? 7
  return env === 'dev' ? n * 36e5 : n * 864e5   // hours vs days in ms
}

// ── Waitlist ─────────────────────────────────────────────────

export async function joinWaitlist({ email, name, source, chain_pref, lang }) {
  return supabase
    .from('waitlist')
    .insert({ email, name, source, chain_pref, lang })
    .select('id')
    .single()
}

// ── Users ────────────────────────────────────────────────────

export async function getUser(walletAddress) {
  return supabase
    .from('users')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single()
}

export async function upsertUser({ wallet_address, chain, alias, lang }) {
  return supabase
    .from('users')
    .upsert({ wallet_address, chain, alias, lang }, { onConflict: 'wallet_address' })
    .select('*')
    .single()
}

export async function updateUserProfile(walletAddress, { alias, email, lang }) {
  return supabase
    .from('users')
    .update({ alias, email, lang })
    .eq('wallet_address', walletAddress)
    .select('*')
    .single()
}

// ── Pods ─────────────────────────────────────────────────────

export async function getOpenPods({ chain } = {}) {
  let q = supabase
    .from('pods')
    .select(`
      *,
      organizer:users!organizer_id ( alias, wallet_address ),
      pod_members ( id )
    `)
    .in('status', ['OPEN', 'ACTIVE'])
    .order('created_at', { ascending: false })

  if (chain) q = q.eq('chain', chain)
  return q
}

export async function getPod(podId) {
  return supabase
    .from('pods')
    .select(`
      *,
      organizer:users!organizer_id ( id, alias, wallet_address, reputation_score ),
      pod_members (
        id, payout_slot, status, joined_at,
        user:users ( id, alias, wallet_address, reputation_score )
      )
    `)
    .eq('id', podId)
    .single()
}

export async function getMyPods(userId) {
  return supabase
    .from('pods')
    .select(`
      *,
      pod_members!inner ( user_id, status, payout_slot )
    `)
    .eq('pod_members.user_id', userId)
    .in('status', ['ACTIVE', 'LOCKED', 'OPEN'])
    .order('created_at', { ascending: false })
}

export async function getOrganizerPods(userId) {
  return supabase
    .from('pods')
    .select(`*, pod_members ( id )`)
    .eq('organizer_id', userId)
    .order('created_at', { ascending: false })
}

// All pods the user has joined as a member (excludes ones they organized)
export async function getMemberPods(userId) {
  return supabase
    .from('pods')
    .select(`*, pod_members!inner ( user_id, payout_slot, status )`)
    .eq('pod_members.user_id', userId)
    .neq('organizer_id', userId)
    .order('created_at', { ascending: false })
}

export async function updatePodStatus(podId, status) {
  return supabase
    .from('pods')
    .update({ status })
    .eq('id', podId)
    .select('id')
    .single()
}

export async function updatePodContract(podId, { contract_address, creation_fee_tx, creation_fee_paid, status, deployed_at }) {
  return supabase
    .from('pods')
    .update({ contract_address, creation_fee_tx, creation_fee_paid, status, deployed_at })
    .eq('id', podId)
    .select('id')
    .single()
}

// Save XRPL escrow seed — written once at pod creation.
// Readable only by service_role (Netlify functions), never via anon key.
export async function savePodEscrow(podId, escrowSeed) {
  return supabase
    .from('pod_escrows')
    .insert({ pod_id: podId, escrow_seed: escrowSeed })
    .select('pod_id')
    .single()
}

export async function createPod({
  chain, token, name, organizer_id,
  contribution_amount, size, payout_method,
  cycle_frequency_days = 7, env,
}) {
  return supabase
    .from('pods')
    .insert({
      chain, token, name, organizer_id,
      contribution_amount, size,
      total_cycles: size,       // 1 cycle per member
      payout_method, cycle_frequency_days, env,
      status: 'OPEN',
    })
    .select('id')
    .single()
}

// ── Pod Members ──────────────────────────────────────────────

export async function joinPod(podId, userId) {
  return supabase
    .from('pod_members')
    .insert({ pod_id: podId, user_id: userId, status: 'ACTIVE' })
    .select('id')
    .single()
}

// Call after every join — if pod is now full, assign slots and activate
export async function maybeActivatePod(podId) {
  // Fetch pod + current members
  const { data: pod } = await supabase
    .from('pods')
    .select('id, size, status, payout_method, pod_members(id)')
    .eq('id', podId)
    .single()

  if (!pod || pod.status !== 'OPEN') return null
  const memberCount = pod.pod_members?.length ?? 0
  if (memberCount < pod.size) return null   // not full yet

  // Fetch members in join order to assign slots
  const { data: members } = await supabase
    .from('pod_members')
    .select('id')
    .eq('pod_id', podId)
    .order('joined_at', { ascending: true })

  if (!members) return null

  // Assign payout_slot (1-based). For RANDOM order, shuffle.
  let slots = members.map((_, i) => i + 1)
  if (pod.payout_method === 'RANDOM') {
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]]
    }
  }

  // Write payout slots
  await Promise.all(members.map((m, i) =>
    supabase.from('pod_members').update({ payout_slot: slots[i] }).eq('id', m.id)
  ))

  // Activate pod — stamp cycle_started_at so due date can be computed
  return supabase
    .from('pods')
    .update({ status: 'ACTIVE', current_cycle: 1, cycle_started_at: new Date().toISOString() })
    .eq('id', podId)
    .select('id, status, current_cycle')
    .single()
}

// After all members pay for a cycle, advance to next or complete the pod
export async function maybeAdvanceCycle(podId) {
  const { data: pod } = await supabase
    .from('pods')
    .select('id, size, current_cycle, total_cycles, status')
    .eq('id', podId)
    .single()

  if (!pod || pod.status !== 'ACTIVE') return null

  const { count } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('pod_id', podId)
    .eq('cycle', pod.current_cycle)
    .eq('status', 'CONFIRMED')

  if (count < pod.size) return null   // not everyone has paid yet

  const nextCycle = pod.current_cycle + 1
  const done      = nextCycle > pod.total_cycles

  return supabase
    .from('pods')
    .update(done
      ? { status: 'COMPLETED', completed_at: new Date().toISOString() }
      : { current_cycle: nextCycle, cycle_started_at: new Date().toISOString() }
    )
    .eq('id', podId)
    .select('id, status, current_cycle')
    .single()
}

// ── Payments ─────────────────────────────────────────────────

export async function recordPayment({ pod_id, user_id, cycle, amount, token, chain, method, tx_hash }) {
  return supabase
    .from('payments')
    .upsert(
      { pod_id, user_id, cycle, amount, token, chain, method, tx_hash, status: 'CONFIRMED', paid_at: new Date().toISOString() },
      { onConflict: 'pod_id,user_id,cycle' }
    )
    .select('id')
    .single()
}

export async function getPodPayments(podId) {
  return supabase
    .from('payments')
    .select(`
      *,
      user:users ( alias, wallet_address )
    `)
    .eq('pod_id', podId)
    .order('cycle', { ascending: true })
    .order('paid_at', { ascending: true })
}

export async function getMyPayments(userId, podId) {
  return supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .eq('pod_id', podId)
    .order('cycle', { ascending: true })
}

// ── Disputes ─────────────────────────────────────────────────

export async function fileDispute({ pod_id, reporter_id, respondent_id, type, description, amount_at_stake }) {
  return supabase
    .from('disputes')
    .insert({ pod_id, reporter_id, respondent_id, type, description, amount_at_stake, priority: 'MEDIUM' })
    .select('id')
    .single()
}

export async function getMyDisputes(userId) {
  return supabase
    .from('disputes')
    .select(`
      *,
      pod:pods ( name, chain ),
      reporter:users!reporter_id ( alias ),
      respondent:users!respondent_id ( alias )
    `)
    .or(`reporter_id.eq.${userId},respondent_id.eq.${userId}`)
    .order('created_at', { ascending: false })
}

// ── Reputation ───────────────────────────────────────────────

export async function getReputationHistory(userId) {
  return supabase
    .from('reputation_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
}

// ── Admin queries ────────────────────────────────────────────

export async function adminGetAllPods() {
  return supabase
    .from('pods')
    .select(`*, organizer:users!organizer_id ( alias, wallet_address, email ), pod_members ( id )`)
    .order('created_at', { ascending: false })
}

export async function adminGetAllUsers() {
  return supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })
}

export async function adminGetWaitlist() {
  return supabase
    .from('waitlist')
    .select('*')
    .order('created_at', { ascending: false })
}

export async function adminGetAmbassadors() {
  return supabase
    .from('ambassadors')
    .select(`*, user:users ( alias, email, wallet_address, chain )`)
    .order('created_at', { ascending: false })
}

export async function adminGetDisputes() {
  return supabase
    .from('disputes')
    .select(`
      *,
      pod:pods ( name ),
      reporter:users!reporter_id ( alias, wallet_address ),
      respondent:users!respondent_id ( alias, wallet_address )
    `)
    .order('created_at', { ascending: false })
}

export async function adminUpdateUserStatus(userId, status) {
  return supabase
    .from('users')
    .update({ status })
    .eq('id', userId)
    .select('id')
    .single()
}

export async function adminUpdateDisputeStatus(disputeId, status) {
  return supabase
    .from('disputes')
    .update({ status, resolved_at: status === 'RESOLVED' ? new Date().toISOString() : null })
    .eq('id', disputeId)
    .select('id')
    .single()
}

// ── Platform Settings ────────────────────────────────────────

export async function getSetting(key) {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', key)
    .single()
  return error ? null : data?.value
}

export async function getSettings(keys) {
  const { data } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', keys)
  return Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
}

// ── Treasury ─────────────────────────────────────────────────

export async function adminGetTreasuryWallets() {
  return supabase
    .from('treasury_wallets')
    .select('*, set_by_admin:admin_users!set_by(email)')
    .order('chain')
}

export async function adminGetTreasuryProposals() {
  return supabase
    .from('treasury_wallet_proposals')
    .select('*, proposed_by_admin:admin_users!proposed_by(email)')
    .order('created_at', { ascending: false })
    .limit(20)
}

export async function adminUpsertTreasuryWallet(chain, address, label, adminId) {
  return supabase
    .from('treasury_wallets')
    .upsert({ chain, address, label, set_by: adminId, active: true }, { onConflict: 'chain' })
    .select()
    .single()
}

export async function adminCreateTreasuryProposal(chain, proposedAddress, reason, adminId) {
  return supabase
    .from('treasury_wallet_proposals')
    .insert({ chain, proposed_address: proposedAddress, reason, proposed_by: adminId })
    .select()
    .single()
}
