import { test, expect } from '@playwright/test'

test.describe('Landing page', () => {

  test.beforeEach(async ({ page }) => {
    // Mock the Supabase waitlist insert so tests never hit the real DB
    await page.route('**/rest/v1/waitlist*', async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'mock-id', email: 'test@example.com' }]),
      })
    })

    await page.goto('/')

    await page.waitForFunction(() => typeof window.__i18n !== 'undefined')
    await page.evaluate(async () => {
      await window.__i18n.changeLanguage('en')
    })
  })

  test('hero section renders headline and CTAs', async ({ page }) => {
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.getByRole('button').first()).toBeVisible()
  })

  test('waitlist form accepts email and shows success', async ({ page }) => {
    await page.evaluate(() =>
      document.getElementById('waitlist')?.scrollIntoView()
    )

    const emailInput = page.locator('input[type="email"]').first()
    await emailInput.fill('testuser@example.com')

    // In English: t('waitlist.cta') = "Notify me"
    const submitBtn = page.getByRole('button', { name: /notify me/i })
    await submitBtn.click()

    // t('waitlist.success') = "✓ You're on the list! We'll be in touch."
    await expect(page.getByText(/you're on the list/i)).toBeVisible({ timeout: 5000 })
  })

  test('waitlist submit button requires a valid email', async ({ page }) => {
    await page.evaluate(() =>
      document.getElementById('waitlist')?.scrollIntoView()
    )

    const submitBtn = page.getByRole('button', { name: /notify me/i })
    await expect(submitBtn).toBeVisible()

    // With empty input, button is disabled or native validation blocks submit
    const isDisabled = await submitBtn.isDisabled()
    if (isDisabled) {
      await expect(submitBtn).toBeDisabled()
    } else {
      await submitBtn.click()
      // Success message must NOT appear
      await expect(page.getByText(/you're on the list/i)).not.toBeVisible()
    }
  })

})
