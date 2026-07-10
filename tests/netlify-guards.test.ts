/**
 * Unit tests for Netlify function guard logic — no real XRPL or Supabase.
 *
 * Strategy: extract the guard conditions from each handler and test them
 * directly. This covers every early-return path without spinning up a server.
 *
 * For full integration tests against devnet see: tests/README.md
 */
import { describe, it, expect } from 'vitest'

// ── vault-deposit guards ─────────────────────────────────────

describe('vault-deposit guards', () => {
  function canDeposit(pod: any, escrowRow: any) {
    if (!pod)                                             return { ok: false, status: 404, error: 'Pod not found' }
    if (pod.tanda_type !== 'yield' || pod.yield_strategy !== 'vault')
                                                          return { ok: false, status: 400, error: 'Pod is not a yield/vault pod' }
    if (pod.chain !== 'XRPL')                             return { ok: false, status: 400, error: 'Not an XRPL pod' }
    if (!escrowRow?.escrow_seed)                          return { ok: false, status: 400, error: 'No escrow configured for this pod' }
    if (escrowRow.vault_status === 'deposited')           return { ok: false, status: 409, error: 'Vault deposit already completed' }
    return { ok: true }
  }

  it('rejects missing pod with 404', () => {
    const r = canDeposit(null, {})
    expect(r.ok).toBe(false)
    expect(r.status).toBe(404)
  })

  it('rejects non-yield pod with 400', () => {
    const pod = { tanda_type: 'standard', yield_strategy: null, chain: 'XRPL' }
    const r = canDeposit(pod, { escrow_seed: 'seed', vault_status: 'none' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toContain('yield/vault')
  })

  it('rejects Ethereum pod with 400', () => {
    const pod = { tanda_type: 'yield', yield_strategy: 'vault', chain: 'Ethereum' }
    const r = canDeposit(pod, { escrow_seed: 'seed', vault_status: 'none' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
  })

  it('rejects missing escrow seed with 400', () => {
    const pod = { tanda_type: 'yield', yield_strategy: 'vault', chain: 'XRPL' }
    const r = canDeposit(pod, { escrow_seed: null, vault_status: 'none' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toContain('escrow')
  })

  it('rejects already-deposited vault with 409 (idempotency)', () => {
    const pod = { tanda_type: 'yield', yield_strategy: 'vault', chain: 'XRPL' }
    const r = canDeposit(pod, { escrow_seed: 'seed', vault_status: 'deposited' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(409)
  })

  it('allows a fresh yield/vault XRPL pod with escrow', () => {
    const pod = { tanda_type: 'yield', yield_strategy: 'vault', chain: 'XRPL' }
    const r = canDeposit(pod, { escrow_seed: 'seed', vault_status: 'none' })
    expect(r.ok).toBe(true)
  })
})

// ── vault-withdraw guards ────────────────────────────────────

describe('vault-withdraw guards', () => {
  function canWithdraw(pod: any, escrowRow: any, body: any) {
    if (!pod)                                             return { ok: false, status: 404, error: 'Pod not found' }
    if (pod.tanda_type !== 'yield' || pod.yield_strategy !== 'vault')
                                                          return { ok: false, status: 400, error: 'Not a yield/vault pod' }
    if (!body.full && !body.amount)                       return { ok: false, status: 400, error: 'Provide amount or full: true' }
    if (body.amount !== undefined && parseFloat(body.amount) <= 0)
                                                          return { ok: false, status: 400, error: 'amount must be positive' }
    if (!escrowRow?.escrow_seed)                          return { ok: false, status: 400, error: 'No escrow configured' }
    if (escrowRow.vault_status !== 'deposited')           return { ok: false, status: 400, error: `Vault not deposited (current: ${escrowRow.vault_status})` }
    if (!escrowRow.vault_id || !escrowRow.vault_shares)   return { ok: false, status: 400, error: 'vault_id or shares missing' }
    return { ok: true }
  }

  const basePod    = { tanda_type: 'yield', yield_strategy: 'vault', chain: 'XRPL' }
  const baseEscrow = { escrow_seed: 'seed', vault_id: 'SIMULATED', vault_shares: '200', vault_status: 'deposited' }

  it('allows full withdrawal', () => {
    expect(canWithdraw(basePod, baseEscrow, { full: true }).ok).toBe(true)
  })

  it('allows partial withdrawal with positive amount', () => {
    expect(canWithdraw(basePod, baseEscrow, { amount: '100' }).ok).toBe(true)
  })

  it('rejects when neither full nor amount provided', () => {
    const r = canWithdraw(basePod, baseEscrow, {})
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
  })

  it('rejects negative amount', () => {
    const r = canWithdraw(basePod, baseEscrow, { amount: '-50' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
  })

  it('rejects when vault_status is none (not deposited)', () => {
    const r = canWithdraw(basePod, { ...baseEscrow, vault_status: 'none' }, { full: true })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toContain('none')
  })

  it('rejects when vault_id is missing', () => {
    const r = canWithdraw(basePod, { ...baseEscrow, vault_id: null }, { full: true })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
  })
})

// ── slash guards ─────────────────────────────────────────────

describe('slash-xrpl-collateral guards', () => {
  function canSlash(pod: any, member: any, payment: any, slash: any, cycleDueMs: number) {
    if (!pod)                   return { ok: false, status: 404, error: 'Pod not found' }
    if (pod.status !== 'ACTIVE')return { ok: false, status: 400, error: 'Pod is not active' }
    if (Date.now() < cycleDueMs)return { ok: false, status: 400, error: 'Cycle not yet overdue' }
    if (!member)                return { ok: false, status: 404, error: 'Member not found' }
    if (payment)                return { ok: false, status: 400, error: 'Member has already paid this cycle' }
    if (slash)                  return { ok: false, status: 400, error: 'Collateral already slashed this cycle' }
    return { ok: true }
  }

  const now     = Date.now()
  const overdue = now - 1000   // 1 second ago = overdue
  const future  = now + 86400000  // 1 day from now = not overdue

  const pod    = { id: 'p1', status: 'ACTIVE', current_cycle: 1 }
  const member = { id: 'm1', user_id: 'u1' }

  it('allows slash when cycle is overdue and member has not paid', () => {
    expect(canSlash(pod, member, null, null, overdue).ok).toBe(true)
  })

  it('rejects when cycle is not yet due', () => {
    const r = canSlash(pod, member, null, null, future)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('overdue')
  })

  it('rejects when pod is not ACTIVE', () => {
    const r = canSlash({ ...pod, status: 'OPEN' }, member, null, null, overdue)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('not active')
  })

  it('rejects when member has already paid this cycle', () => {
    const r = canSlash(pod, member, { id: 'pay-1' }, null, overdue)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('already paid')
  })

  it('rejects double-slash on same cycle (idempotency)', () => {
    const r = canSlash(pod, member, null, { id: 'slash-1' }, overdue)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('already slashed')
  })

  it('rejects when member not found in pod', () => {
    const r = canSlash(pod, null, null, null, overdue)
    expect(r.ok).toBe(false)
    expect(r.status).toBe(404)
  })

  it('rejects missing pod with 404', () => {
    const r = canSlash(null, member, null, null, overdue)
    expect(r.ok).toBe(false)
    expect(r.status).toBe(404)
  })
})

// ── NOT_ENABLED error detection ──────────────────────────────

describe('isNotEnabledError (XLS-66d fallback detection)', () => {
  const NOT_ENABLED_PATTERNS = ['temUNKNOWN', 'temDISABLED', 'tecNO_PERMISSION', 'not enabled', 'Unknown transaction type']

  function isNotEnabledError(err: any): boolean {
    const msg = String(err?.message ?? err?.data?.error ?? '')
    return NOT_ENABLED_PATTERNS.some(p => msg.includes(p))
  }

  it('detects temUNKNOWN', () => {
    expect(isNotEnabledError(new Error('temUNKNOWN: bad tx'))).toBe(true)
  })

  it('detects temDISABLED', () => {
    expect(isNotEnabledError(new Error('temDISABLED'))).toBe(true)
  })

  it('detects tecNO_PERMISSION', () => {
    expect(isNotEnabledError(new Error('tecNO_PERMISSION'))).toBe(true)
  })

  it('detects "not enabled" substring', () => {
    expect(isNotEnabledError(new Error('Feature not enabled on this network'))).toBe(true)
  })

  it('detects "Unknown transaction type"', () => {
    expect(isNotEnabledError(new Error('Unknown transaction type: VaultCreate'))).toBe(true)
  })

  it('does NOT flag unrelated errors', () => {
    expect(isNotEnabledError(new Error('Insufficient XRP balance'))).toBe(false)
    expect(isNotEnabledError(new Error('tecNO_AUTH'))).toBe(false)
    expect(isNotEnabledError(new Error('Connection timeout'))).toBe(false)
  })

  it('handles error objects with data.error field', () => {
    expect(isNotEnabledError({ data: { error: 'temUNKNOWN' } })).toBe(true)
  })

  it('handles null/undefined safely', () => {
    expect(isNotEnabledError(null)).toBe(false)
    expect(isNotEnabledError(undefined)).toBe(false)
  })
})
