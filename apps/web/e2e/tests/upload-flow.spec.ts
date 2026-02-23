import { test, expect } from '@playwright/test';
import { setupAuthenticated } from '../fixtures/auth';

test.describe('Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('dashboard CTA card navigates to upload page on click', async ({ page }) => {
    // Override getOverview mock to return empty analytics so the CTA card is visible
    await page.addInitScript(() => {
      const fns = (window as any).__E2E_MOCK_FUNCTIONS__;
      if (fns) {
        fns.getOverview = () => ({
          total_content_pieces: 0, total_outputs_generated: 0, total_published: 0,
          total_reach: 0, total_engagements: 0, avg_multiplier_score: 0,
          best_multiplier_score: 0, platforms_active: 0, top_performing_content: [], recent_performance: [],
        });
        fns.listConnections = () => ({ items: [], total: 0 });
      }
    });

    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });

    // The "Upload your first piece of content" CTA card should be visible
    await expect(page.getByText('Upload your first piece of content')).toBeVisible({ timeout: 10000 });

    // Click the CTA card itself (not just the button)
    await page.getByText('Upload your first piece of content').click();

    // Should navigate to /content/upload
    await page.waitForURL('**/content/upload', { timeout: 5000 });
    expect(page.url()).toContain('/content/upload');
  });

  test('dashboard Get Started button navigates to upload page', async ({ page }) => {
    // Override getOverview mock to return empty analytics so the CTA card is visible
    await page.addInitScript(() => {
      const fns = (window as any).__E2E_MOCK_FUNCTIONS__;
      if (fns) {
        fns.getOverview = () => ({
          total_content_pieces: 0, total_outputs_generated: 0, total_published: 0,
          total_reach: 0, total_engagements: 0, avg_multiplier_score: 0,
          best_multiplier_score: 0, platforms_active: 0, top_performing_content: [], recent_performance: [],
        });
        fns.listConnections = () => ({ items: [], total: 0 });
      }
    });

    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });

    // Click the "Get Started" button
    await page.getByRole('button', { name: 'Get Started' }).click();

    await page.waitForURL('**/content/upload', { timeout: 5000 });
    expect(page.url()).toContain('/content/upload');
  });

  test('upload page renders paste and file upload modes', async ({ page }) => {
    await page.goto('/content/upload');
    await expect(page.getByText('Upload Content')).toBeVisible({ timeout: 10000 });

    // Paste Content mode button should be visible and active by default
    await expect(page.getByRole('button', { name: 'Paste Content' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'File Upload' })).toBeVisible();

    // Should show the paste form by default
    await expect(page.getByText('Blog / Article')).toBeVisible();
  });

  test('upload page has back button that navigates to content list', async ({ page }) => {
    await page.goto('/content/upload');
    await expect(page.getByText('Upload Content')).toBeVisible({ timeout: 10000 });

    // Click the back button (ArrowLeft icon button)
    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') });
    await backButton.click();

    await page.waitForURL('**/content', { timeout: 5000 });
    expect(page.url()).toContain('/content');
  });

  test('quick action "Upload Content" card navigates to upload page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });

    // Click the Upload Content quick action card
    await page.getByText('Upload Content').click();

    await page.waitForURL('**/content/upload', { timeout: 5000 });
    expect(page.url()).toContain('/content/upload');
  });
});
