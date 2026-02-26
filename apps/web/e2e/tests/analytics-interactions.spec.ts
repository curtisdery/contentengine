import { test, expect } from '@playwright/test';
import { setupAuthenticated, blockFirebaseApis } from '../fixtures/auth';
import { MOCK_USER, MOCK_ANALYTICS_EMPTY } from '../helpers/mock-responses';

/**
 * Analytics dashboard interaction tests.
 */

test.describe('Analytics Dashboard Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('analytics page shows heading', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page.getByText(/analytics/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('analytics page shows stat cards with data', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');

    // Mock analytics has real data
    await expect(page.getByText('Total Reach')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Engagements')).toBeVisible();
    await expect(page.getByText('Content Pieces')).toBeVisible();
    await expect(page.getByText('Published')).toBeVisible();
  });

  test('analytics page shows platform performance section', async ({ page }) => {
    await page.goto('/analytics');

    await expect(page.getByRole('heading', { name: 'Platform Performance' })).toBeVisible({ timeout: 30000 });
  });
});

test.describe('Analytics Empty State', () => {
  test('shows empty state when no content published', async ({ page }) => {
    await blockFirebaseApis(page);

    await page.addInitScript((m: any) => {
      (window as any).__E2E_AUTH_MOCK__ = true;
      (window as any).__E2E_MOCK_USER__ = m.user;
      (window as any).__E2E_MOCK_FUNCTIONS__ = {
        createProfile: () => m.user,
        getOverview: () => m.emptyAnalytics,
        getPlatformAnalytics: () => ({ platforms: [] }),
        getContentTypeAnalytics: () => [],
        getHookAnalytics: () => [],
        getHeatmap: () => ({ heatmap: [] }),
        getAudienceIntelligence: () => ({}),
        getContentStrategy: () => ({ recommendations: [] }),
        listConnections: () => ({ items: [], total: 0 }),
        getAutopilotSummary: () => ({ autopilot_enabled: 0, eligible_not_enabled: 0, total_auto_published: 0, platforms: [] }),
        getNotifications: () => ({ items: [], total: 0, unread_count: 0 }),
      };
    }, { user: MOCK_USER, emptyAnalytics: MOCK_ANALYTICS_EMPTY });

    await page.goto('/analytics');
    await expect(page.getByText(/analytics.*waiting/i)).toBeVisible({ timeout: 15000 });
  });
});
