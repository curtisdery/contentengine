import { test, expect } from '@playwright/test';
import { blockFirebaseApis } from '../fixtures/auth';
import { MOCK_USER } from '../helpers/mock-responses';

/**
 * Content detail page tests — exercises the content DNA view,
 * re-analyze flow, emphasis notes, and navigation to outputs.
 */

const MOCK_CONTENT_ID = 'e2e-content-detail-001';

const MOCK_CONTENT_COMPLETED = {
  id: MOCK_CONTENT_ID,
  title: 'How to Build a SaaS',
  content_type: 'blog',
  status: 'completed',
  raw_content: 'Full article content about building SaaS products.',
  dna: {
    core_thesis: 'Building a SaaS requires focusing on real problems.',
    supporting_pillars: ['Market fit', 'Execution speed', 'Customer feedback'],
    emotional_arc: 'Determined optimism',
    unique_angle: 'Builder perspective',
    quotable_moments: ['Focus on the problem, not the solution.'],
    data_points: ['47% revenue increase in 6 months'],
    audience_signals: ['Founders', 'Indie hackers'],
  },
  created_at: '2025-06-01T10:00:00Z',
  updated_at: '2025-06-01T10:00:00Z',
};

const MOCK_CONTENT_ANALYZING = {
  ...MOCK_CONTENT_COMPLETED,
  status: 'analyzing',
  dna: null,
};

const MOCK_CONTENT_FAILED = {
  ...MOCK_CONTENT_COMPLETED,
  status: 'failed',
  dna: null,
};

function setupContentDetail(page: any, contentOverride?: any) {
  return page.addInitScript((m: any) => {
    (window as any).__E2E_AUTH_MOCK__ = true;
    (window as any).__E2E_MOCK_USER__ = m.user;
    (window as any).__E2E_MOCK_FUNCTIONS__ = {
      createProfile: () => m.user,
      getContent: () => m.content,
      updateContent: () => ({ success: true }),
      reanalyzeContent: () => ({ success: true }),
      listVoiceProfiles: () => ({ items: [], total: 0 }),
      triggerGeneration: () => ({ items: [], total: 0 }),
      listOutputs: () => ({ items: [], total: 0 }),
      getOverview: () => ({
        total_content_pieces: 1, total_outputs_generated: 0, total_published: 0,
        total_reach: 0, total_engagements: 0, avg_multiplier_score: 0,
        best_multiplier_score: 0, platforms_active: 0, top_performing_content: [], recent_performance: [],
      }),
      listConnections: () => ({ items: [], total: 0 }),
      getAutopilotSummary: () => ({ autopilot_enabled: 0, eligible_not_enabled: 0, total_auto_published: 0, platforms: [] }),
      getNotifications: () => ({ items: [], total: 0, unread_count: 0 }),
    };
  }, { user: MOCK_USER, content: contentOverride || MOCK_CONTENT_COMPLETED });
}

test.describe('Content Detail Page', () => {
  test('loads completed content with DNA card and next steps', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentDetail(page);

    await page.goto(`/content/${MOCK_CONTENT_ID}`);
    await expect(page.getByText('How to Build a SaaS')).toBeVisible({ timeout: 15000 });

    // Content type badge
    await expect(page.getByText(/blog/i).first()).toBeVisible();

    // Next Steps section
    await expect(page.getByText('Next Steps')).toBeVisible();
  });

  test('shows Generate and View Outputs buttons for completed content', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentDetail(page);

    await page.goto(`/content/${MOCK_CONTENT_ID}`);
    await expect(page.getByText('How to Build a SaaS')).toBeVisible({ timeout: 15000 });

    // Both are buttons on the page
    await expect(page.getByRole('button', { name: 'Generate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View Outputs' })).toBeVisible();
  });

  test('Re-analyze button is visible for completed content', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentDetail(page);

    await page.goto(`/content/${MOCK_CONTENT_ID}`);
    await expect(page.getByText('How to Build a SaaS')).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole('button', { name: /re-analyze/i })).toBeVisible();
  });

  test('shows emphasis notes textarea', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentDetail(page);

    await page.goto(`/content/${MOCK_CONTENT_ID}`);
    await expect(page.getByText('How to Build a SaaS')).toBeVisible({ timeout: 15000 });

    const emphasisNotes = page.getByPlaceholder(/emphasis|adjust.*focus|optional/i);
    await expect(emphasisNotes).toBeVisible();
  });

  test('back button navigates to content list', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentDetail(page);

    await page.goto(`/content/${MOCK_CONTENT_ID}`);
    await expect(page.getByText('How to Build a SaaS')).toBeVisible({ timeout: 15000 });

    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') });
    await backButton.click();
    await page.waitForURL(/\/content$/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/content$/);
  });

  test('shows analyzing state with title visible', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentDetail(page, MOCK_CONTENT_ANALYZING);

    await page.goto(`/content/${MOCK_CONTENT_ID}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('How to Build a SaaS')).toBeVisible({ timeout: 15000 });
  });

  test('shows failed state with retry button', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentDetail(page, MOCK_CONTENT_FAILED);

    await page.goto(`/content/${MOCK_CONTENT_ID}`);
    await expect(page.getByText('How to Build a SaaS')).toBeVisible({ timeout: 15000 });

    await expect(page.getByText(/failed|retry/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('View Outputs button navigates to outputs page', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupContentDetail(page);

    await page.goto(`/content/${MOCK_CONTENT_ID}`);
    await expect(page.getByText('How to Build a SaaS')).toBeVisible({ timeout: 15000 });

    // It's a button element, not a link
    await page.getByRole('button', { name: 'View Outputs' }).click();
    await page.waitForURL(`**/content/${MOCK_CONTENT_ID}/outputs`, { timeout: 5000 });
    expect(page.url()).toContain(`/content/${MOCK_CONTENT_ID}/outputs`);
  });
});
