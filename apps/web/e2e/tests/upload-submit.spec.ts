import { test, expect, Page } from '@playwright/test';

/**
 * Upload submission test — exercises the actual POST to the backend.
 * Isolated in its own file for clarity. The backend skips rate limiting
 * for dev-token requests so this test isn't affected by prior test activity.
 */

async function blockFirebase(page: Page) {
  await page.route('**/*identitytoolkit.googleapis.com/**', (route) => route.abort());
  await page.route('**/*securetoken.googleapis.com/**', (route) => route.abort());
  await page.route('**/*firebaseinstallations.googleapis.com/**', (route) => route.abort());
  await page.route('**/*firebase.googleapis.com/**', (route) => route.abort());
  await page.route('**/*google-analytics.com/**', (route) => route.abort());
  await page.route('**/*googletagmanager.com/**', (route) => route.abort());
}

const MOCK_USER = {
  id: 'e2e-upload-user',
  email: 'dev@pandocast.local',
  full_name: 'Dev User',
  firebase_uid: null,
  avatar_url: null,
  subscription_tier: 'free' as const,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

test.describe('Upload Submission (real backend)', () => {
  test.beforeEach(async ({ page }) => {
    await blockFirebase(page);
    await page.addInitScript((user) => {
      (window as any).__E2E_AUTH_MOCK__ = true;
      (window as any).__E2E_MOCK_USER__ = user;
    }, MOCK_USER);
  });

  test('submit content → detail page → back → content list', async ({ page }) => {
    test.slow();
    await page.goto('/content/upload');
    await expect(page.getByText('Upload Content')).toBeVisible({ timeout: 15000 });

    const title = `E2E Upload ${Date.now()}`;
    await page.getByPlaceholder('Give your content a descriptive title').fill(title);
    await page.getByPlaceholder('Paste your blog post or article content here...').fill(
      'This is an end-to-end test that verifies the full content upload pipeline.'
    );

    await page.getByRole('button', { name: 'Analyze Content' }).click();

    // Wait for redirect to content detail
    await page.waitForURL(/\/content\/[0-9a-f-]+/, { timeout: 30000 });

    // Verify detail page
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Blog')).toBeVisible();

    // Click back → content list
    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') });
    await backButton.click();
    await page.waitForURL(/\/content$/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/content$/);

    // Verify content list shows the uploaded item
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 5000 });
  });
});
