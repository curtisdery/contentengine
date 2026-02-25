import { test, expect, Page } from '@playwright/test';
import { MOCK_USER } from '../helpers/mock-responses';

/**
 * Set up authenticated session with a FREE-tier user to test subscription buttons.
 * Uses Cloud Function mocks instead of REST API route interception.
 */
async function setupFreeUser(page: Page) {
  // Block Firebase APIs
  await page.route('**/*identitytoolkit.googleapis.com/**', (route) => route.abort());
  await page.route('**/*securetoken.googleapis.com/**', (route) => route.abort());
  await page.route('**/*firebaseinstallations.googleapis.com/**', (route) => route.abort());
  await page.route('**/*firebase.googleapis.com/**', (route) => route.abort());
  await page.route('**/*google-analytics.com/**', (route) => route.abort());
  await page.route('**/*googletagmanager.com/**', (route) => route.abort());

  const freeUser = { ...MOCK_USER, subscription_tier: 'free' };

  await page.addInitScript((m) => {
    (window as any).__E2E_AUTH_MOCK__ = true;
    (window as any).__E2E_MOCK_USER__ = m.user;
    (window as any).__E2E_MOCK_FUNCTIONS__ = {
      createProfile: () => m.user,
      createPortal: () => ({ portal_url: 'https://billing.stripe.com/test-portal' }),
      createCheckout: () => ({ checkout_url: 'https://checkout.stripe.com/test-session' }),
      getSubscriptionStatus: () => ({ tier: 'free', is_active: true }),
      getOverview: () => ({
        total_content_pieces: 0, total_outputs_generated: 0, total_published: 0,
        total_reach: 0, total_engagements: 0, avg_multiplier_score: 0,
        best_multiplier_score: 0, platforms_active: 0, top_performing_content: [], recent_performance: [],
      }),
      listConnections: () => ({ items: [], total: 0 }),
      getAutopilotSummary: () => ({ autopilot_enabled: 0, eligible_not_enabled: 0, total_auto_published: 0, platforms: [] }),
      listSessions: () => ({ sessions: [] }),
      getAuditLog: () => ({ entries: [], total: 0 }),
      listContent: () => ({ items: [], total: 0 }),
    };
  }, { user: freeUser });
}

test.describe('Subscription Flow', () => {
  test('settings page shows Free plan for free-tier user', async ({ page }) => {
    await setupFreeUser(page);
    await page.goto('/settings');
    await expect(page.getByText('Free Plan')).toBeVisible({ timeout: 10000 });
  });

  test('shows both Manage Subscription and Upgrade to Pro buttons for free user', async ({ page }) => {
    await setupFreeUser(page);
    await page.goto('/settings');
    await expect(page.getByText('Free Plan')).toBeVisible({ timeout: 10000 });

    await expect(page.getByRole('button', { name: 'Manage Subscription' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upgrade to Growth' })).toBeVisible();
  });

  test('Manage Subscription button calls billing portal API', async ({ page }) => {
    await setupFreeUser(page);

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
    await setupFreeUser(page);

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
    await setupFreeUser(page);
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('Settings', { timeout: 10000 });

    // Click "Connected Platforms" nav card
    await page.getByText('Connected Platforms').click();
    await page.waitForURL('**/settings/connections', { timeout: 5000 });
    expect(page.url()).toContain('/settings/connections');
  });

  test('View all security settings button navigates', async ({ page }) => {
    await setupFreeUser(page);
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('Settings', { timeout: 10000 });

    await page.getByRole('button', { name: 'View all security settings' }).click();
    await page.waitForURL('**/settings/security', { timeout: 5000 });
    expect(page.url()).toContain('/settings/security');
  });
});
