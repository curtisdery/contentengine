import { test, expect } from '@playwright/test';
import { setupAuthenticated, blockFirebaseApis } from '../fixtures/auth';
import { MOCK_USER, MOCK_EMPTY_CONTENT_LIST } from '../helpers/mock-responses';

/**
 * Content list page interaction tests.
 */

test.describe('Content List Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('content page shows heading', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByText('Your Content')).toBeVisible({ timeout: 15000 });
  });

  test('content page shows Upload New button', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByText('Your Content')).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole('button', { name: /upload new/i })).toBeVisible();
  });

  test('Upload New button navigates to upload page', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByText('Your Content')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /upload new/i }).click();
    await page.waitForURL('**/content/upload', { timeout: 5000 });
    expect(page.url()).toContain('/content/upload');
  });

  test('content page shows content items from mock', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByText('Your Content')).toBeVisible({ timeout: 15000 });

    // Mock has 2 items: "How to Build a SaaS" and "Podcast Episode 42"
    await expect(page.getByText('How to Build a SaaS')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Podcast Episode 42')).toBeVisible();
  });

  test('clicking content item navigates to detail page', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByText('Your Content')).toBeVisible({ timeout: 15000 });

    await page.getByText('How to Build a SaaS').click();
    await page.waitForURL(/\/content\/[0-9a-z-]+/, { timeout: 5000 });
    expect(page.url()).toContain('/content/660e8400');
  });
});

test.describe('Content List Empty State', () => {
  test('shows empty state when no content exists', async ({ page }) => {
    await blockFirebaseApis(page);

    await page.addInitScript((m: any) => {
      (window as any).__E2E_AUTH_MOCK__ = true;
      (window as any).__E2E_MOCK_USER__ = m.user;
      (window as any).__E2E_MOCK_FUNCTIONS__ = {
        createProfile: () => m.user,
        listContent: () => m.emptyList,
        getOverview: () => ({
          total_content_pieces: 0, total_outputs_generated: 0, total_published: 0,
          total_reach: 0, total_engagements: 0, avg_multiplier_score: 0,
          best_multiplier_score: 0, platforms_active: 0, top_performing_content: [], recent_performance: [],
        }),
        listConnections: () => ({ items: [], total: 0 }),
        getAutopilotSummary: () => ({ autopilot_enabled: 0, eligible_not_enabled: 0, total_auto_published: 0, platforms: [] }),
        getNotifications: () => ({ items: [], total: 0, unread_count: 0 }),
      };
    }, { user: MOCK_USER, emptyList: MOCK_EMPTY_CONTENT_LIST });

    await page.goto('/content');
    await expect(page.getByText(/no content yet/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /upload your first/i })).toBeVisible();
  });
});
