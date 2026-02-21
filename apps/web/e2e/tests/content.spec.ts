import { test, expect } from '@playwright/test';
import { setupAuthenticated } from '../fixtures/auth';

test.describe('Content Pages', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('content page loads', async ({ page }) => {
    await page.goto('/content');
    await page.waitForURL('**/content', { timeout: 10000 });
    expect(page.url()).toContain('/content');
  });

  test('content upload page loads', async ({ page }) => {
    await page.goto('/content/upload');
    await page.waitForURL('**/content/upload', { timeout: 10000 });
    expect(page.url()).toContain('/content/upload');
  });

  test('can navigate to content from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });
    await page.locator('aside').getByRole('link', { name: 'Content' }).click();
    await page.waitForURL('**/content', { timeout: 5000 });
    expect(page.url()).toContain('/content');
  });
});
