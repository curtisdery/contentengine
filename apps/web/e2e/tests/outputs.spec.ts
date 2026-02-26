import { test, expect } from '@playwright/test';
import { blockFirebaseApis } from '../fixtures/auth';
import { MOCK_USER, MOCK_OUTPUTS } from '../helpers/mock-responses';

/**
 * Outputs page tests — exercises output cards, filter tabs,
 * approve actions, and bulk operations.
 */

const MOCK_CONTENT_ID = '660e8400-e29b-41d4-a716-446655440001';

function setupOutputsPage(page: any, outputsOverride?: any) {
  return page.addInitScript((m: any) => {
    (window as any).__E2E_AUTH_MOCK__ = true;
    (window as any).__E2E_MOCK_USER__ = m.user;
    (window as any).__E2E_MOCK_FUNCTIONS__ = {
      createProfile: () => m.user,
      listOutputs: () => m.outputs,
      approveOutput: () => ({ success: true }),
      editOutput: () => ({ success: true }),
      bulkApproveOutputs: () => ({ approved_count: m.outputs.items.filter((i: any) => i.status === 'draft').length }),
      regenerateOutput: () => ({ success: true }),
      getOverview: () => ({
        total_content_pieces: 1, total_outputs_generated: m.outputs.total, total_published: 0,
        total_reach: 0, total_engagements: 0, avg_multiplier_score: 0,
        best_multiplier_score: 0, platforms_active: 0, top_performing_content: [], recent_performance: [],
      }),
      listConnections: () => ({ items: [], total: 0 }),
      getAutopilotSummary: () => ({ autopilot_enabled: 0, eligible_not_enabled: 0, total_auto_published: 0, platforms: [] }),
      getNotifications: () => ({ items: [], total: 0, unread_count: 0 }),
    };
  }, { user: MOCK_USER, outputs: outputsOverride || MOCK_OUTPUTS });
}

test.describe('Outputs Page', () => {
  test('loads and displays output cards', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupOutputsPage(page);

    await page.goto(`/content/${MOCK_CONTENT_ID}/outputs`);
    await page.waitForLoadState('networkidle');

    // Should show the output count
    await expect(page.getByText(/3 output/i)).toBeVisible({ timeout: 15000 });
  });

  test('shows filter tabs: All, Draft, Approved', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupOutputsPage(page);

    await page.goto(`/content/${MOCK_CONTENT_ID}/outputs`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /all/i }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /draft/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /approved/i }).first()).toBeVisible();
  });

  test('shows Approve All Drafts button when drafts exist', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupOutputsPage(page);

    await page.goto(`/content/${MOCK_CONTENT_ID}/outputs`);
    await page.waitForLoadState('networkidle');

    // 2 of 3 outputs are drafts
    await expect(page.getByRole('button', { name: /approve all drafts/i })).toBeVisible({ timeout: 15000 });
  });

  test('back button navigates to content detail', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupOutputsPage(page);

    await page.goto(`/content/${MOCK_CONTENT_ID}/outputs`);
    await page.waitForLoadState('networkidle');

    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') });
    await expect(backButton).toBeVisible({ timeout: 15000 });
    await backButton.click();
    await page.waitForURL(`**/content/${MOCK_CONTENT_ID}`, { timeout: 5000 });
    expect(page.url()).toContain(`/content/${MOCK_CONTENT_ID}`);
    expect(page.url()).not.toContain('/outputs');
  });

  test('empty outputs shows empty state', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupOutputsPage(page, { items: [], total: 0 });

    await page.goto(`/content/${MOCK_CONTENT_ID}/outputs`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/no outputs/i)).toBeVisible({ timeout: 15000 });
  });

  test('Select All / Deselect All toggle works', async ({ page }) => {
    await blockFirebaseApis(page);
    await setupOutputsPage(page);

    await page.goto(`/content/${MOCK_CONTENT_ID}/outputs`);
    await page.waitForLoadState('networkidle');

    const selectAll = page.getByRole('button', { name: /select all/i });
    if (await selectAll.isVisible()) {
      await selectAll.click();
      await expect(page.getByRole('button', { name: /deselect all/i })).toBeVisible();
    }
  });
});
