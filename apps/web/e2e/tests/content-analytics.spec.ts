import { test, expect } from '@playwright/test';
import { blockFirebaseApis } from '../fixtures/auth';
import { MOCK_USER } from '../helpers/mock-responses';

/**
 * Per-content analytics page tests.
 */

const MOCK_CONTENT_ID = '660e8400-e29b-41d4-a716-446655440001';

const MOCK_CONTENT_ANALYTICS = {
  content_id: MOCK_CONTENT_ID,
  title: 'How to Build a SaaS',
  content_type: 'blog',
  created_at: '2025-06-01T10:00:00Z',
  multiplier_score: {
    id: 'ms-001',
    content_upload_id: MOCK_CONTENT_ID,
    multiplier_value: 4.2,
    original_reach: 2950,
    total_reach: 12400,
    total_engagements: 3200,
    platforms_published: 3,
    platform_breakdown: [
      { platform_id: 'twitter', platform_name: 'Twitter', reach: 5200, engagements: 1200, engagement_rate: 0.23 },
      { platform_id: 'linkedin', platform_name: 'LinkedIn', reach: 4800, engagements: 1500, engagement_rate: 0.31 },
      { platform_id: 'instagram', platform_name: 'Instagram', reach: 2400, engagements: 500, engagement_rate: 0.21 },
    ],
    best_platform_id: 'twitter',
    best_platform_reach: 5200,
    calculated_at: '2025-06-02T00:00:00Z',
  },
  performance_timeline: [
    { date: '2025-06-01', impressions: 1000, engagements: 200 },
    { date: '2025-06-02', impressions: 2500, engagements: 600 },
  ],
  output_performance: [
    {
      output_id: 'output-001',
      platform_id: 'twitter',
      platform_name: 'Twitter',
      format_name: 'TWITTER_SINGLE',
      impressions: 5200,
      engagements: 1200,
      engagement_rate: 0.23,
      published_at: '2025-06-01T12:00:00Z',
    },
  ],
};

function setupContentAnalytics(page: any) {
  return page.addInitScript((m: any) => {
    (window as any).__E2E_AUTH_MOCK__ = true;
    (window as any).__E2E_MOCK_USER__ = m.user;
    (window as any).__E2E_MOCK_FUNCTIONS__ = {
      createProfile: () => m.user,
      getContentAnalytics: () => m.analytics,
      getOverview: () => ({
        total_content_pieces: 1, total_outputs_generated: 3, total_published: 3,
        total_reach: 12400, total_engagements: 3200, avg_multiplier_score: 4.2,
        best_multiplier_score: 4.2, platforms_active: 3, top_performing_content: [], recent_performance: [],
      }),
      listConnections: () => ({ items: [], total: 0 }),
      getAutopilotSummary: () => ({ autopilot_enabled: 0, eligible_not_enabled: 0, total_auto_published: 0, platforms: [] }),
      getNotifications: () => ({ items: [], total: 0, unread_count: 0 }),
    };
  }, { user: MOCK_USER, analytics: MOCK_CONTENT_ANALYTICS });
}

test.describe('Per-Content Analytics Page', () => {
  test('loads and displays content title', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentAnalytics(page);

    await page.goto(`/analytics/${MOCK_CONTENT_ID}`);
    await expect(page.getByText('How to Build a SaaS')).toBeVisible({ timeout: 15000 });
  });

  test('shows multiplier score', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentAnalytics(page);

    await page.goto(`/analytics/${MOCK_CONTENT_ID}`);
    await expect(page.getByText('4.2x')).toBeVisible({ timeout: 15000 });
  });

  test('shows stat cards with data', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentAnalytics(page);

    await page.goto(`/analytics/${MOCK_CONTENT_ID}`);
    await expect(page.getByText('Total Reach')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Total Engagements')).toBeVisible();
    await expect(page.getByText('Platforms Published')).toBeVisible();
  });

  test('has back to analytics link', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentAnalytics(page);

    await page.goto(`/analytics/${MOCK_CONTENT_ID}`);
    await expect(page.getByText(/back to analytics/i)).toBeVisible({ timeout: 15000 });

    await page.getByText(/back to analytics/i).click();
    await page.waitForURL('**/analytics', { timeout: 5000 });
    expect(page.url()).toMatch(/\/analytics$/);
  });

  test('shows content type badge', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentAnalytics(page);

    await page.goto(`/analytics/${MOCK_CONTENT_ID}`);
    await expect(page.getByText(/blog/i).first()).toBeVisible({ timeout: 15000 });
  });
});
