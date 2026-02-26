import { test, expect } from '@playwright/test';
import { setupUnauthenticated } from '../fixtures/auth';

test.describe('Privacy Policy Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnauthenticated(page);
  });

  test('privacy page renders heading', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible({ timeout: 10000 });
  });

  test('privacy page shows effective date', async ({ page }) => {
    await page.goto('/privacy');
    // Actual text is "Effective: February 24, 2026"
    await expect(page.getByText(/effective.*2026/i)).toBeVisible({ timeout: 10000 });
  });

  test('privacy page has section headings', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByText('1. Information We Collect')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('6. Your Rights')).toBeVisible();
    await expect(page.getByText('11. Contact')).toBeVisible();
  });

  test('privacy page has back to home link', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible({ timeout: 10000 });
  });

  test('privacy page has footer with copyright', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByText(/pandocast inc.*all rights reserved/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Terms of Service Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnauthenticated(page);
  });

  test('terms page renders heading', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible({ timeout: 10000 });
  });

  test('terms page shows effective date', async ({ page }) => {
    await page.goto('/terms');
    // Actual text is "Effective: February 24, 2026"
    await expect(page.getByText(/effective.*2026/i)).toBeVisible({ timeout: 10000 });
  });

  test('terms page has section headings', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByText('1. The Service')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('7. Subscriptions and Billing')).toBeVisible();
    await expect(page.getByText('18. Contact')).toBeVisible();
  });

  test('terms page has back to home link', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible({ timeout: 10000 });
  });

  test('terms page has footer with copyright', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByText(/pandocast inc.*all rights reserved/i)).toBeVisible({ timeout: 10000 });
  });
});
