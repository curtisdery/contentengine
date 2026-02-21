import { test, expect } from '@playwright/test';
import { setupAuthenticated } from '../fixtures/auth';

test.describe('Settings Pages', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForURL('**/settings', { timeout: 10000 });
    expect(page.url()).toContain('/settings');
  });

  test('settings/connections sub-route loads', async ({ page }) => {
    await page.goto('/settings/connections');
    await page.waitForURL('**/settings/connections', { timeout: 10000 });
    expect(page.url()).toContain('/settings/connections');
  });

  test('settings/autopilot sub-route loads', async ({ page }) => {
    await page.goto('/settings/autopilot');
    await page.waitForURL('**/settings/autopilot', { timeout: 10000 });
    expect(page.url()).toContain('/settings/autopilot');
  });

  test('settings/security sub-route loads', async ({ page }) => {
    await page.goto('/settings/security');
    await page.waitForURL('**/settings/security', { timeout: 10000 });
    expect(page.url()).toContain('/settings/security');
  });

  test('can navigate to settings from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });
    await page.locator('aside').getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL('**/settings', { timeout: 5000 });
    expect(page.url()).toContain('/settings');
  });
});
