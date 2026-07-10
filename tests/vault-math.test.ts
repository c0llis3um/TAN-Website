/**
 * Pure math tests — no mocking needed.
 * Covers yield calculations used in YieldVaultCard and vault-withdraw.js.
 */
import { describe, it, expect } from 'vitest'

// ── Replicated from YieldVaultCard ───────────────────────────
const APY = { vault: 0.06, amm: 0.10 }

function calcYield(principal: number, strategy: 'vault' | 'amm', depositedAt: Date) {
  const apy     = APY[strategy]
  const elapsed = Date.now() - depositedAt.getTime()
  const years   = elapsed / (365.25 * 24 * 60 * 60 * 1000)
  const earned  = principal * apy * years
  return { currentValue: principal + earned, earned, growthPct: (earned / principal) * 100 }
}

// ── Replicated from vault-withdraw.js ────────────────────────
function simulateYield(principalStr: string, depositedAt: string): string {
  const principal = parseFloat(principalStr)
  const elapsed   = Date.now() - new Date(depositedAt).getTime()
  const years     = elapsed / (365.25 * 24 * 60 * 60 * 1000)
  const gained    = principal * 0.06 * years
  return (principal + gained).toFixed(6)
}

function sharesForAmount(totalSharesStr: string, totalValueStr: string, amountStr: string): string {
  const totalShares = parseFloat(totalSharesStr)
  const totalValue  = parseFloat(totalValueStr) || parseFloat(totalSharesStr)
  const amount      = parseFloat(amountStr)
  if (amount >= totalValue) return totalSharesStr
  const ratio = amount / totalValue
  return (totalShares * ratio).toFixed(6)
}

// ────────────────────────────────────────────────────────────

describe('YieldVaultCard — yield calculation', () => {
  it('principal equals currentValue at t=0', () => {
    const now = new Date()
    const { currentValue, earned } = calcYield(200, 'vault', now)
    expect(earned).toBeCloseTo(0, 6)
    expect(currentValue).toBeCloseTo(200, 6)
  })

  it('vault 6% APY earns ~0.986 RLUSD on 200 principal after 30 days', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const { earned } = calcYield(200, 'vault', thirtyDaysAgo)
    // 200 * 0.06 * (30/365.25) ≈ 0.9856
    expect(earned).toBeGreaterThan(0.98)
    expect(earned).toBeLessThan(1.00)
  })

  it('AMM earns more than vault over the same period', () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    const vault = calcYield(200, 'vault', sixtyDaysAgo)
    const amm   = calcYield(200, 'amm',   sixtyDaysAgo)
    expect(amm.earned).toBeGreaterThan(vault.earned)
  })

  it('growth percentage is positive after any elapsed time', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const { growthPct } = calcYield(500, 'vault', oneDayAgo)
    expect(growthPct).toBeGreaterThan(0)
  })

  it('larger principal earns proportionally more', () => {
    const date = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const small = calcYield(100, 'vault', date)
    const large = calcYield(1000, 'vault', date)
    expect(large.earned).toBeCloseTo(small.earned * 10, 4)
  })
})

describe('simulateYield (vault-withdraw simulation)', () => {
  it('returns principal when deposit is brand new', () => {
    const now = new Date().toISOString()
    const result = parseFloat(simulateYield('200', now))
    expect(result).toBeCloseTo(200, 2)
  })

  it('returns more than principal after 30 days', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const result = parseFloat(simulateYield('200', thirtyDaysAgo))
    expect(result).toBeGreaterThan(200)
  })

  it('result is a valid 6-decimal string', () => {
    const date = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const result = simulateYield('100', date)
    expect(result).toMatch(/^\d+\.\d{6}$/)
  })
})

describe('sharesForAmount (partial vault withdrawal)', () => {
  it('returns all shares when amount equals total value', () => {
    expect(sharesForAmount('200', '200', '200')).toBe('200')
  })

  it('returns all shares when amount exceeds total value', () => {
    expect(sharesForAmount('200', '200', '300')).toBe('200')
  })

  it('returns 50% of shares for 50% of value', () => {
    const result = parseFloat(sharesForAmount('200', '200', '100'))
    expect(result).toBeCloseTo(100, 4)
  })

  it('returns 25% of shares for 25% of value', () => {
    const result = parseFloat(sharesForAmount('400', '400', '100'))
    expect(result).toBeCloseTo(100, 4)
  })

  it('falls back to 1:1 when totalValue is 0', () => {
    // totalValue = 0 → falls back to totalShares as proxy
    const result = parseFloat(sharesForAmount('200', '0', '100'))
    expect(result).toBeCloseTo(100, 4)
  })

  it('slash of 1× contribution from 2× principal leaves 50% shares', () => {
    // member deposited 200 RLUSD (2× contribution of 100)
    // slash takes 100 RLUSD
    const result = parseFloat(sharesForAmount('200', '200', '100'))
    expect(result).toBeCloseTo(100, 4)
  })
})
