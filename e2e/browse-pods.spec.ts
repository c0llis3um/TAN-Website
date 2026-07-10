import { test, expect } from '@playwright/test'

const MOCK_PODS = [
  {
    id: 'pod-1', name: 'Pilsen Crew', chain: 'XRPL', token: 'RLUSD',
    size: 10, filled: 3, contribution: 100, status: 'ACTIVE',
    cycle_unit: 'monthly', payout_order: 'random',
    organizer: { alias: 'alice', wallet_address: 'rAlice1234' },
    pod_members: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
  },
  {
    id: 'pod-2', name: 'Miami Circle', chain: 'Ethereum', token: 'USDC',
    size: 6, filled: 1, contribution: 50, status: 'OPEN',
    cycle_unit: 'monthly', payout_order: 'fixed',
    organizer: { alias: 'bob', wallet_address: '0xBob1234' },
    pod_members: [{ id: 'm4' }],
  },
  {
    id: 'pod-3', name: 'Austin XRP', chain: 'XRPL', token: 'XRP',
    size: 8, filled: 8, contribution: 200, status: 'OPEN',
    cycle_unit: 'weekly', payout_order: 'random',
    organizer: { alias: 'carol', wallet_address: 'rCarol5678' },
    pod_members: [{ id: 'm5' }, { id: 'm6' }, { id: 'm7' }, { id: 'm8' }, { id: 'm9' }, { id: 'm10' }, { id: 'm11' }, { id: 'm12' }],
  },
]

test.describe('Browse Pods', () => {

  test.beforeEach(async ({ page }) => {
    // Mock the Supabase getOpenPods query (matches any supabase pods REST call)
    await page.route('**/rest/v1/pods*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PODS),
      })
    })

    await page.goto('/app/pods')

    await page.waitForFunction(() => typeof window.__i18n !== 'undefined')
    await page.evaluate(async () => {
      await window.__i18n.changeLanguage('en')
    })
  })

  test('renders all pods on load', async ({ page }) => {
    await expect(page.getByText('Pilsen Crew')).toBeVisible()
    await expect(page.getByText('Miami Circle')).toBeVisible()
    await expect(page.getByText('Austin XRP')).toBeVisible()
  })

  test('search filters pods by name', async ({ page }) => {
    // t('browse.search') = "Search by name…" in English
    const searchInput = page.getByPlaceholder(/search by name/i)
    await searchInput.fill('miami')

    await expect(page.getByText('Miami Circle')).toBeVisible()
    await expect(page.getByText('Pilsen Crew')).not.toBeVisible()
    await expect(page.getByText('Austin XRP')).not.toBeVisible()
  })

  test('chain filter shows only XRPL pods', async ({ page }) => {
    await page.getByRole('button', { name: 'XRPL' }).click()

    await expect(page.getByText('Pilsen Crew')).toBeVisible()
    await expect(page.getByText('Austin XRP')).toBeVisible()
    await expect(page.getByText('Miami Circle')).not.toBeVisible()
  })

  test('chain filter shows only Ethereum pods', async ({ page }) => {
    await page.getByRole('button', { name: 'Ethereum' }).click()

    await expect(page.getByText('Miami Circle')).toBeVisible()
    await expect(page.getByText('Pilsen Crew')).not.toBeVisible()
  })

  test('clicking a pod card navigates to pod detail', async ({ page }) => {
    await page.route('**/rest/v1/pods*id=eq.pod-1*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_PODS[0]]),
      })
    })

    // Pilsen Crew is ACTIVE so it shows "View Pod →" button (t('browse.viewPod'))
    await page.getByRole('button', { name: /view pod/i }).first().click()
    await expect(page).toHaveURL(/\/app\/pod\/pod-1/)
  })

})
