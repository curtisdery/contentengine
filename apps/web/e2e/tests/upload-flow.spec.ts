import { test, expect } from '@playwright/test';
import { setupAuthenticated } from '../fixtures/auth';

test.describe('Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('dashboard CTA card navigates to upload page on click', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });

    // The "Upload your first piece of content" CTA card should be visible
    await expect(page.getByText('Upload your first piece of content')).toBeVisible();

    // Click the CTA card itself (not just the button)
    await page.getByText('Upload your first piece of content').click();

    // Should navigate to /content/upload
    await page.waitForURL('**/content/upload', { timeout: 5000 });
    expect(page.url()).toContain('/content/upload');
  });

  test('dashboard Get Started button navigates to upload page', async ({ page }) => {
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
