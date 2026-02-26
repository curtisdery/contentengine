import { test, expect } from '@playwright/test';
import { blockFirebaseApis } from '../fixtures/auth';
import { MOCK_USER } from '../helpers/mock-responses';

/**
 * Upload submission test — exercises the createContent Cloud Function mock.
 * Uses a custom mock setup to track content creation state.
 */

const MOCK_CONTENT_ID = 'e2e-mock-content-001';

test.describe('Upload Submission', () => {
  test.beforeEach(async ({ page }) => {
    await blockFirebaseApis(page);

    await page.addInitScript((m) => {
      let lastTitle = 'Test Content';

      (window as any).__E2E_AUTH_MOCK__ = true;
      (window as any).__E2E_MOCK_USER__ = m.user;
      (window as any).__E2E_MOCK_FUNCTIONS__ = {
        createProfile: () => m.user,
        createContent: (data: any) => {
          lastTitle = data?.title || 'Test Content';
          return {
            id: m.contentId,
            title: lastTitle,
            content_type: data?.content_type || 'blog',
            status: 'analyzing',
            raw_content: data?.raw_content || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        },
        getContent: () => ({
          id: m.contentId,
          title: lastTitle,
          content_type: 'blog',
          status: 'completed',
          raw_content: 'Test content',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        listContent: () => ({
          items: [{
            id: m.contentId,
            title: lastTitle,
            content_type: 'blog',
            status: 'completed',
            created_at: new Date().toISOString(),
            platform_count: 0,
          }],
          total: 1,
          page: 1,
          per_page: 20,
        }),
        updateContent: () => ({ success: true }),
        reanalyzeContent: () => ({ success: true }),
        getOverview: () => ({
          total_content_pieces: 0, total_outputs_generated: 0, total_published: 0,
          total_reach: 0, total_engagements: 0, avg_multiplier_score: 0,
          best_multiplier_score: 0, platforms_active: 0, top_performing_content: [], recent_performance: [],
        }),
        listConnections: () => ({ items: [], total: 0 }),
        getAutopilotSummary: () => ({ autopilot_enabled: 0, eligible_not_enabled: 0, total_auto_published: 0, platforms: [] }),
        listVoiceProfiles: () => ({ items: [], total: 0 }),
        getNotifications: () => ({ items: [], total: 0, unread_count: 0 }),
      };
    }, { user: MOCK_USER, contentId: MOCK_CONTENT_ID });
  });

  test('submit content → detail page → back → content list', async ({ page }) => {
    test.slow();
    await page.goto('/content/upload');
    await expect(page.getByText('Upload Content')).toBeVisible({ timeout: 15000 });

    const title = `E2E Upload ${Date.now()}`;
    await page.getByPlaceholder('Give your content a descriptive title').fill(title);
    await page.getByPlaceholder('Paste your blog post or article content here...').fill(
      'This is an end-to-end test that verifies the full content upload pipeline.'
    );

    await page.getByRole('button', { name: 'Analyze Content' }).click();

    // Wait for redirect to content detail
    await page.waitForURL(/\/content\/[0-9a-z-]+/, { timeout: 30000 });

    // Verify detail page
    await expect(page.getByText(/blog/i).first()).toBeVisible({ timeout: 10000 });

    // Click back → content list
    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') });
    await backButton.click();
    await page.waitForURL(/\/content$/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/content$/);
  });
});
