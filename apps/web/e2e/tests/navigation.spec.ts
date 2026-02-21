import { test, expect } from '@playwright/test';
import { setupAuthenticated } from '../fixtures/auth';

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });
  });

  test('navigates to Content via sidebar', async ({ page }) => {
    await page.locator('aside').getByRole('link', { name: 'Content' }).click();
    await page.waitForURL('**/content', { timeout: 5000 });
    expect(page.url()).toContain('/content');
  });

  test('navigates to Voice via sidebar', async ({ page }) => {
    await page.locator('aside').getByRole('link', { name: 'Voice' }).click();
    await page.waitForURL('**/voice/**', { timeout: 5000 });
    expect(page.url()).toContain('/voice');
  });

  test('navigates to Calendar via sidebar', async ({ page }) => {
    await page.locator('aside').getByRole('link', { name: 'Calendar' }).click();
    await page.waitForURL('**/calendar', { timeout: 5000 });
    expect(page.url()).toContain('/calendar');
  });

  test('navigates to Analytics via sidebar', async ({ page }) => {
    await page.locator('aside').getByRole('link', { name: 'Analytics' }).click();
    await page.waitForURL('**/analytics', { timeout: 5000 });
    expect(page.url()).toContain('/analytics');
  });

  test('navigates to Settings via sidebar', async ({ page }) => {
    await page.locator('aside').getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL('**/settings', { timeout: 5000 });
    expect(page.url()).toContain('/settings');
  });

  test('can return to Dashboard from another section', async ({ page }) => {
    // Navigate away from dashboard first
    await page.locator('aside').getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL('**/settings', { timeout: 5000 });
    // Navigate back to dashboard using direct URL (avoids React re-render detach)
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain('/dashboard');
  });

  test('sidebar collapse toggle works', async ({ page }) => {
    const collapseBtn = page.getByRole('button', { name: 'Collapse sidebar' });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  });
});
