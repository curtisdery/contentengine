import { test, expect } from '@playwright/test';
import { setupAuthenticated } from '../fixtures/auth';

test.describe('Logout Flow', () => {
  test('logout button redirects to login', async ({ page }) => {
    await setupAuthenticated(page);
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Logout' }).click();

    await page.waitForURL('**/login', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });
});
