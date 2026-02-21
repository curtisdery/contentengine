import { test, expect, Page } from '@playwright/test';
import { MOCK_USER } from '../helpers/mock-responses';

/**
 * Set up authenticated session with a FREE-tier user to test subscription buttons.
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

  // Mock API routes
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(freeUser) })
  );

  // Mock billing portal endpoint
  await page.route('**/api/v1/billing/portal', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ portal_url: 'https://billing.stripe.com/test-portal' }),
    })
  );

  // Mock billing checkout endpoint
  await page.route('**/api/v1/billing/create-checkout', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ checkout_url: 'https://checkout.stripe.com/test-session' }),
    })
  );

  // Catch-all for other API endpoints
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  );

  // Inject auth mock
  await page.addInitScript((user) => {
    (window as any).__E2E_AUTH_MOCK__ = true;
    (window as any).__E2E_MOCK_USER__ = user;
  }, freeUser);
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
    await expect(page.getByRole('button', { name: 'Upgrade to Pro' })).toBeVisible();
  });

  test('Manage Subscription button calls billing portal API', async ({ page }) => {
    await setupFreeUser(page);

    // Track API calls
    const apiCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/billing/')) {
        apiCalls.push(req.url());
      }
    });

    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Manage Subscription' })).toBeVisible({ timeout: 10000 });

    // Click Manage Subscription — it will try to redirect to the portal URL
    // We intercept the navigation to prevent leaving the page
    await page.route('https://billing.stripe.com/**', (route) => route.abort());
    await page.getByRole('button', { name: 'Manage Subscription' }).click();

    // Wait for the API call to be made
    await page.waitForTimeout(1000);

    // Verify the billing portal API was called
    expect(apiCalls.some((url) => url.includes('/billing/portal'))).toBe(true);
  });

  test('Upgrade to Pro button calls billing checkout API', async ({ page }) => {
    await setupFreeUser(page);

    const apiCalls: { url: string; body: string | null }[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/billing/')) {
        apiCalls.push({ url: req.url(), body: req.postData() });
      }
    });

    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Upgrade to Pro' })).toBeVisible({ timeout: 10000 });

    // Intercept Stripe redirect
    await page.route('https://checkout.stripe.com/**', (route) => route.abort());
    await page.getByRole('button', { name: 'Upgrade to Pro' }).click();

    await page.waitForTimeout(1000);

    // Verify the billing checkout API was called with correct params
    const checkoutCall = apiCalls.find((c) => c.url.includes('/billing/create-checkout'));
    expect(checkoutCall).toBeDefined();
    expect(checkoutCall!.body).toContain('"tier":"pro"');
    expect(checkoutCall!.body).toContain('success_url');
    expect(checkoutCall!.body).toContain('cancel_url');
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
