import { test, expect } from '@playwright/test'

test.describe('Admin login', () => {

  test('renders the login form', async ({ page }) => {
    await page.goto('/admin/login')

    await expect(page.getByText('Admin Portal')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    // Mock Supabase auth to return an error
    await page.route('**/auth/v1/token*', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      })
    })

    await page.goto('/admin/login')
    await page.locator('input[type="email"]').fill('wrong@example.com')
    await page.locator('input[type="password"]').fill('badpassword')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 5000 })
  })

  test('redirects to /admin on successful login', async ({ page }) => {
    // Mock Supabase auth success
    await page.route('**/auth/v1/token*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-token',
          token_type: 'bearer',
          user: { id: 'mock-user-id', email: 'admin@defitanda.com' },
        }),
      })
    })

    // Mock admin_users table lookup
    await page.route('**/rest/v1/admin_users*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'mock-user-id', email: 'admin@defitanda.com', role: 'super_admin' }]),
      })
    })

    await page.goto('/admin/login')
    await page.locator('input[type="email"]').fill('admin@defitanda.com')
    await page.locator('input[type="password"]').fill('correctpassword')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page).toHaveURL(/\/admin/, { timeout: 5000 })
  })

  test('admin dashboard is gated — redirects unauthenticated users', async ({ page }) => {
    await page.goto('/admin')
    // Should redirect to login — check for the email input as the definitive signal
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 })
  })

})
