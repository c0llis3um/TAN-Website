import { test, expect } from '@playwright/test'

const WALLET = 'rTestMockWalletAddress1234567890'

// 30 days ago — gives us a known elapsed window for yield assertions
const DEPOSITED_AT = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

const MOCK_YIELD_POD = {
  id: 'pod-yield-1',
  name: 'Pilsen Yield Crew',
  chain: 'XRPL',
  token: 'RLUSD',
  tanda_type: 'yield',
  yield_strategy: 'vault',
  contribution_amount: 100,
  size: 12,
  total_cycles: 12,
  status: 'ACTIVE',
  current_cycle: 2,
  cycle_frequency_days: 30,
  cycle_started_at: DEPOSITED_AT,
  payout_method: 'random',
  contract_address: 'rEscrowMock123456789',
  env: 'dev',
  organizer: { id: 'org-1', alias: 'alice', wallet_address: 'rAlice123' },
  pod_members: [
    { id: 'm1', payout_slot: 1, status: 'ACTIVE', user: { id: 'u1', alias: 'alice', wallet_address: 'rAlice123', reputation_score: 95 } },
    { id: 'm2', payout_slot: 2, status: 'ACTIVE', user: { id: 'u2', alias: 'me', wallet_address: WALLET, reputation_score: 100 } },
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `m${i + 3}`, payout_slot: i + 3, status: 'ACTIVE',
      user: { id: `u${i + 3}`, alias: `member${i + 3}`, wallet_address: `rMember${i + 3}`, reputation_score: 80 },
    })),
  ],
}

const MOCK_VAULT_DEPOSITED = {
  vault_id: 'SIMULATED',
  vault_shares: '200',
  vault_deposited_at: DEPOSITED_AT,
  vault_status: 'deposited',
}

const MOCK_VAULT_PENDING = {
  vault_id: null,
  vault_shares: null,
  vault_deposited_at: null,
  vault_status: 'none',
}

test.describe('PodView — Yield Vault Card', () => {

  async function setupPage(page, vaultInfo) {
    await page.route('**/rest/v1/pods*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_YIELD_POD]) })
    })
    await page.route('**/rest/v1/payments*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await page.route('**/rest/v1/pod_escrows*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([vaultInfo]) })
    })
    await page.route('**/rest/v1/platform_settings*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ key: 'kyc_required', value: 'false' }]) })
    })

    await page.goto('/app/pod/pod-yield-1')

    await page.waitForFunction(() => typeof window.__tanStore !== 'undefined' && typeof window.__i18n !== 'undefined')
    await page.evaluate(async (wallet) => {
      window.__tanStore.setState({ wallet: { address: wallet, chain: 'XRPL' } })
      await window.__i18n.changeLanguage('en')
    }, WALLET)
  }

  // ── Deposited state ───────────────────────────────────────────

  test('vault card renders when vault is deposited', async ({ page }) => {
    await setupPage(page, MOCK_VAULT_DEPOSITED)
    await expect(page.getByText('Your Collateral — Growing')).toBeVisible()
  })

  test('vault card shows APY badge', async ({ page }) => {
    await setupPage(page, MOCK_VAULT_DEPOSITED)
    await expect(page.getByText('~6% APY')).toBeVisible()
  })

  test('vault card shows Sim badge for SIMULATED vault', async ({ page }) => {
    await setupPage(page, MOCK_VAULT_DEPOSITED)
    await expect(page.getByText('Sim')).toBeVisible()
  })

  test('vault card shows Deposited and Earned so far labels', async ({ page }) => {
    await setupPage(page, MOCK_VAULT_DEPOSITED)
    await expect(page.getByText('Deposited')).toBeVisible()
    await expect(page.getByText('Earned so far')).toBeVisible()
  })

  test('vault card shows principal amount (200 RLUSD)', async ({ page }) => {
    await setupPage(page, MOCK_VAULT_DEPOSITED)
    // Principal = contribution_amount * 2 = 100 * 2 = 200
    await expect(page.getByText('200')).toBeVisible()
  })

  test('vault card current value is greater than principal after 30 days', async ({ page }) => {
    await setupPage(page, MOCK_VAULT_DEPOSITED)
    // After 30 days at 6% APY, earned ≈ 200 * 0.06 * (30/365.25) ≈ 0.9856
    // So current value should show something like 200.9856 — starts with "200."
    await expect(page.locator('text=/200\\.[0-9]+/')).toBeVisible()
  })

  test('vault card shows days earning', async ({ page }) => {
    await setupPage(page, MOCK_VAULT_DEPOSITED)
    await expect(page.getByText('Days earning')).toBeVisible()
    // Should be 30 days (give or take 1 for test timing)
    await expect(page.locator('text=/2[89]|30|31/')).toBeVisible()
  })

  test('vault card shows strategy name', async ({ page }) => {
    await setupPage(page, MOCK_VAULT_DEPOSITED)
    await expect(page.getByText('Vault (XLS-66d)')).toBeVisible()
  })

  test('vault card shows simulated yield disclaimer', async ({ page }) => {
    await setupPage(page, MOCK_VAULT_DEPOSITED)
    await expect(page.getByText(/simulated yield/i)).toBeVisible()
  })

  // ── Pending state (vault not yet active) ─────────────────────

  test('vault card shows pending state when vault not deposited', async ({ page }) => {
    await setupPage(page, MOCK_VAULT_PENDING)
    await expect(page.getByText(/vault activates/i)).toBeVisible()
  })

  test('vault card shows APY waiting indicator in pending state', async ({ page }) => {
    await setupPage(page, MOCK_VAULT_PENDING)
    await expect(page.getByText(/APY waiting/i)).toBeVisible()
  })

  test('vault card shows principal in pending state', async ({ page }) => {
    await setupPage(page, MOCK_VAULT_PENDING)
    // Principal = 200 RLUSD shown even before deposit
    await expect(page.getByText('200')).toBeVisible()
  })

  // ── Non-yield pod: card should NOT appear ────────────────────

  test('vault card does not render for standard pods', async ({ page }) => {
    const standardPod = { ...MOCK_YIELD_POD, tanda_type: 'standard', yield_strategy: null }
    await page.route('**/rest/v1/pods*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([standardPod]) })
    })
    await page.route('**/rest/v1/payments*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await page.route('**/rest/v1/pod_escrows*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await page.goto('/app/pod/pod-yield-1')
    await page.waitForFunction(() => typeof window.__tanStore !== 'undefined' && typeof window.__i18n !== 'undefined')
    await page.evaluate(async (wallet) => {
      window.__tanStore.setState({ wallet: { address: wallet, chain: 'XRPL' } })
      await window.__i18n.changeLanguage('en')
    }, WALLET)

    await expect(page.getByText('Your Collateral — Growing')).not.toBeVisible()
  })

  // ── Non-member: card should NOT appear ───────────────────────

  test('vault card does not render for non-members', async ({ page }) => {
    await page.route('**/rest/v1/pods*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_YIELD_POD]) })
    })
    await page.route('**/rest/v1/payments*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await page.route('**/rest/v1/pod_escrows*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_VAULT_DEPOSITED]) })
    })
    await page.goto('/app/pod/pod-yield-1')
    await page.waitForFunction(() => typeof window.__tanStore !== 'undefined' && typeof window.__i18n !== 'undefined')
    await page.evaluate(async () => {
      // Different wallet — not a member of this pod
      window.__tanStore.setState({ wallet: { address: 'rStranger9999', chain: 'XRPL' } })
      await window.__i18n.changeLanguage('en')
    })

    await expect(page.getByText('Your Collateral — Growing')).not.toBeVisible()
  })

})
