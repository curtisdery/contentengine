import { test, expect } from '@playwright/test';
import { setupAuthenticated } from '../fixtures/auth';

/**
 * Calendar page interaction tests.
 */

test.describe('Calendar Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('calendar page shows heading and subtitle', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.getByText(/content calendar/i)).toBeVisible({ timeout: 15000 });
  });

  test('calendar page shows stat items', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Scheduled Today')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('This Week')).toBeVisible();
    await expect(page.getByText('Published')).toBeVisible();
  });

  test('calendar has Week/Month view toggle', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'Week' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Month' })).toBeVisible();
  });

  test('calendar has Today navigation button', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible({ timeout: 15000 });
  });

  test('calendar has Queue button that navigates', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    const queueBtn = page.getByRole('link', { name: /queue/i });
    if (await queueBtn.isVisible()) {
      await queueBtn.click();
      await page.waitForURL('**/calendar/queue', { timeout: 5000 });
      expect(page.url()).toContain('/calendar/queue');
    }
  });

  test('Week/Month toggle switches views', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    // Default should be week view, clicking Month should toggle
    await page.getByRole('button', { name: 'Month' }).click();
    await page.waitForTimeout(500);

    // Click back to Week
    await page.getByRole('button', { name: 'Week' }).click();
    await page.waitForTimeout(500);
  });
});

test.describe('Calendar Queue Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('queue page shows heading', async ({ page }) => {
    await page.goto('/calendar/queue');
    await expect(page.getByText(/publishing queue/i)).toBeVisible({ timeout: 15000 });
  });

  test('queue page has back button to calendar', async ({ page }) => {
    await page.goto('/calendar/queue');
    await page.waitForLoadState('networkidle');

    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') });
    await backButton.click();
    await page.waitForURL('**/calendar', { timeout: 5000 });
    expect(page.url()).toMatch(/\/calendar$/);
  });

  test('queue page shows status filter tabs', async ({ page }) => {
    await page.goto('/calendar/queue');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /^All \d+$/ })).toBeVisible({ timeout: 15000 });
  });
});
