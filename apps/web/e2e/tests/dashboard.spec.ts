import { test, expect } from '@playwright/test';
import { setupAuthenticated } from '../fixtures/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('shows the dashboard page with welcome heading', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });
  });

  test('displays the sidebar with navigation', async ({ page }) => {
    await page.goto('/dashboard');
    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Content' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('shows quick action cards', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/upload/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('quick action card navigates on click', async ({ page }) => {
    await page.goto('/dashboard');
    const uploadCard = page.locator('[role="link"]').filter({ hasText: /upload/i }).first();
    if (await uploadCard.isVisible()) {
      await uploadCard.click();
      await page.waitForURL('**/content/**', { timeout: 5000 });
      expect(page.url()).toContain('/content');
    }
  });

  test('shows user name in sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('Test User')).toBeVisible();
  });
});
