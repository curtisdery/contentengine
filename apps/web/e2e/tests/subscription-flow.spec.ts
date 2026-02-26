import { test, expect } from '@playwright/test';
import { setupAuthenticatedFree } from '../fixtures/auth';

/**
 * Subscription flow tests — uses shared setupAuthenticatedFree fixture
 * which sets up a free-tier user with Stripe billing mocks.
 */

test.describe('Subscription Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedFree(page);
  });

  test('settings page shows Free plan for free-tier user', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Free Plan')).toBeVisible({ timeout: 10000 });
  });

  test('shows both Manage Subscription and Upgrade to Growth buttons for free user', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Free Plan')).toBeVisible({ timeout: 10000 });

    await expect(page.getByRole('button', { name: 'Manage Subscription' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upgrade to Growth' })).toBeVisible();
  });

  test('Manage Subscription button calls billing portal API', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Manage Subscription' })).toBeVisible({ timeout: 10000 });

    // Intercept the Stripe portal redirect with a fulfilled response so the page navigates
    await page.route('https://billing.stripe.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Stripe Portal</body></html>' })
    );

    await page.getByRole('button', { name: 'Manage Subscription' }).click();

    // The mock createPortal returns portal_url, and the handler navigates to it
    await page.waitForURL('**/billing.stripe.com/**', { timeout: 5000 });
    expect(page.url()).toContain('billing.stripe.com/test-portal');
  });

  test('Upgrade to Growth button calls billing checkout API', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Upgrade to Growth' })).toBeVisible({ timeout: 10000 });

    // Intercept Stripe checkout redirect with a fulfilled response
    await page.route('https://checkout.stripe.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Stripe Checkout</body></html>' })
    );

    await page.getByRole('button', { name: 'Upgrade to Growth' }).click();

    // The mock createCheckout returns checkout_url, and the handler navigates to it
    await page.waitForURL('**/checkout.stripe.com/**', { timeout: 5000 });
    expect(page.url()).toContain('checkout.stripe.com/test-session');
  });

  test('settings nav cards navigate correctly', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('Settings', { timeout: 10000 });

    // Click "Connected Platforms" nav card
    await page.getByText('Connected Platforms').click();
    await page.waitForURL('**/settings/connections', { timeout: 5000 });
    expect(page.url()).toContain('/settings/connections');
  });

  test('View all security settings button navigates', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('Settings', { timeout: 10000 });

    await page.getByRole('button', { name: 'View all security settings' }).click();
    await page.waitForURL('**/settings/security', { timeout: 5000 });
    expect(page.url()).toContain('/settings/security');
  });
});
