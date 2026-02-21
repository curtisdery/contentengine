import { test, expect } from '@playwright/test';
import { setupUnauthenticated } from '../fixtures/auth';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnauthenticated(page);
  });

  test('renders the PANDO hero heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('PANDO');
  });

  test('shows the subtitle', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Upload once. Pando everywhere.')).toBeVisible();
  });

  test('has a Log in link in the nav', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  });

  test('has a Join Waitlist button in the nav', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav').getByRole('button', { name: 'Join Waitlist' })).toBeVisible();
  });

  test('displays the platform grid section', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('18 platforms.')).toBeVisible();
  });

  test('displays the pricing section with 3 plans', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('$0')).toBeVisible();
    await expect(page.getByText('$29')).toBeVisible();
    await expect(page.getByText('$79')).toBeVisible();
  });

  test('shows the footer with PANDOCAST branding', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer').getByText('PANDOCAST', { exact: true })).toBeVisible();
  });
});
