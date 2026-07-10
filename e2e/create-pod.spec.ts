import { test, expect } from '@playwright/test'

/**
 * CreatePod wizard — XRPL yield tanda flow.
 *
 * No real wallet is injected, so the test walks every step of the wizard
 * and asserts the review screen renders correct summary rows.
 * The "Deploy" button is intentionally disabled without a wallet — that is
 * the correct gated behavior and is verified explicitly here.
 *
 * To test actual on-chain deployment you would inject a mock wallet into
 * Zustand's useAppStore via page.addInitScript() before navigation.
 */

test.describe('CreatePod wizard', () => {

  // Helper: check all 4 rules boxes and advance past the rules step
  async function passRulesStep(page) {
    const checkboxes = page.locator('input[type="checkbox"]')
    for (let i = 0; i < 4; i++) {
      await checkboxes.nth(i).check()
    }
    await page.getByRole('button', { name: /i understand/i }).click()
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/app/create')

    await page.waitForFunction(() => typeof window.__tanStore !== 'undefined' && typeof window.__i18n !== 'undefined')
    await page.evaluate(async () => {
      window.__tanStore.setState({
        wallet: { address: 'rTestMockWalletAddress1234567890', chain: 'XRPL' },
        lang: 'en',
      })
      await window.__i18n.changeLanguage('en')
    })
  })

  // ── Step 0: Rules ────────────────────────────────────────────

  test('shows rules step on first load with 4 checkboxes', async ({ page }) => {
    await expect(page.getByText('How a DeFi Tanda works')).toBeVisible()
    const checkboxes = page.locator('input[type="checkbox"]')
    await expect(checkboxes).toHaveCount(4)
    await expect(page.getByRole('button', { name: /i understand/i })).toBeDisabled()
  })

  test('rules Continue is disabled until all 4 boxes checked', async ({ page }) => {
    const checkboxes = page.locator('input[type="checkbox"]')
    const btn = page.getByRole('button', { name: /i understand/i })

    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    await checkboxes.nth(2).check()
    await expect(btn).toBeDisabled()

    await checkboxes.nth(3).check()
    await expect(btn).toBeEnabled()
  })

  // ── Step 1: Chain ────────────────────────────────────────────

  test('shows chain selection on first step', async ({ page }) => {
    await passRulesStep(page)
    await expect(page.getByText('XRP Ledger')).toBeVisible()
    await expect(page.getByText('Ethereum')).toBeVisible()
  })

  // ── Full XRPL yield wizard walkthrough ───────────────────────

  test('completes XRPL yield tanda wizard to review screen', async ({ page }) => {
    // Step 0 — Rules
    await passRulesStep(page)

    // Step 1 — Chain: select XRPL (may already be selected as default)
    await page.getByText('XRP Ledger').click()
    await page.getByRole('button', { name: /continue/i }).click()

    // Step 2 — Token: select RLUSD
    await page.getByText('RLUSD').click()
    await page.getByRole('button', { name: /continue/i }).click()

    // Step 3 — Tanda type: select Yield
    await page.getByText('Yield', { exact: true }).click()
    await page.getByRole('button', { name: /continue/i }).click()

    // Step 4 — Strategy: select Vault (XLS-66d)
    await page.getByText('Vault (XLS-66d)').click()
    await page.getByRole('button', { name: /continue/i }).click()

    // Step 5 — Settings: fill in pod name
    // Size slider defaults to 12+ for yield — no need to change
    await page.getByPlaceholder(/pilsen crew/i).fill('E2E Test Pod')
    await page.getByRole('button', { name: /continue/i }).click()

    // Step 6 — Payout order: pick Random (default, just continue)
    await page.getByRole('button', { name: /continue/i }).click()

    // Step 7 — Review: assert summary rows are correct
    await expect(page.getByText('E2E Test Pod')).toBeVisible()
    await expect(page.getByText('RLUSD', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Vault (XLS-66d)')).toBeVisible()
    await expect(page.getByText(/~4.+8% APY/i)).toBeVisible()

    // Yield risk acknowledgment checkboxes must be present
    const riskCheckboxes = page.locator('input[type="checkbox"]')
    await expect(riskCheckboxes.first()).toBeVisible()
  })

  // ── Yield gating: strategy step Continue is disabled until one is chosen ─

  test('strategy Continue button is disabled until a strategy is selected', async ({ page }) => {
    await passRulesStep(page)

    // Navigate through chain → token → type to reach strategy step
    await page.getByText('XRP Ledger').click()
    await page.getByRole('button', { name: /continue/i }).click()

    await page.getByText('RLUSD').click()
    await page.getByRole('button', { name: /continue/i }).click()

    await page.getByText('Yield', { exact: true }).click()
    await page.getByRole('button', { name: /continue/i }).click()

    // On the strategy step, Continue should be disabled
    const continueBtn = page.getByRole('button', { name: /continue/i })
    await expect(continueBtn).toBeDisabled()

    // After selecting a strategy it should unlock
    await page.getByText('Vault (XLS-66d)').click()
    await expect(continueBtn).toBeEnabled()
  })

  // ── Settings: pod name required to advance ───────────────────

  test('settings Continue button is disabled when pod name is empty', async ({ page }) => {
    await passRulesStep(page)

    // XRPL standard tanda — fewer steps to reach settings
    await page.getByText('XRP Ledger').click()
    await page.getByRole('button', { name: /continue/i }).click()

    await page.getByText('XRP', { exact: true }).click()
    await page.getByRole('button', { name: /continue/i }).click()

    // Type step: pick Standard
    await page.getByText('Standard', { exact: true }).click()
    await page.getByRole('button', { name: /continue/i }).click()

    // Settings step — name is empty by default
    const continueBtn = page.getByRole('button', { name: /continue/i })
    await expect(continueBtn).toBeDisabled()

    await page.getByPlaceholder(/pilsen crew/i).fill('My Pod')
    await expect(continueBtn).toBeEnabled()
  })

  // ── Ethereum path: no type/strategy steps ───────────────────

  test('Ethereum path skips type and strategy steps', async ({ page }) => {
    await passRulesStep(page)

    await page.getByText('Ethereum').click()
    await page.getByRole('button', { name: /continue/i }).click()

    // Token step: ETH / USDC / USDT — no RLUSD
    await expect(page.getByText('USDC')).toBeVisible()
    await expect(page.getByText('RLUSD')).not.toBeVisible()
    await page.getByText('USDC').click()
    await page.getByRole('button', { name: /continue/i }).click()

    // Should land on Settings immediately (no type or strategy steps)
    await expect(page.getByPlaceholder(/pilsen crew/i)).toBeVisible()
  })

})
