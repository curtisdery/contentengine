import { test, expect } from '@playwright/test';
import { setupUnauthenticated } from '../fixtures/auth';

test.describe('Blog Pages', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnauthenticated(page);
  });

  // --- Blog Index ---

  test('blog index page renders heading and subtitle', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.getByRole('heading', { name: 'Blog' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Insights on content repurposing')).toBeVisible();
  });

  test('blog index shows the launch post card', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.getByText('Introducing Pandocast')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('4 min read')).toBeVisible();
  });

  test('blog index has back to home link', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible({ timeout: 10000 });
  });

  test('blog index has Pandocast header link to home', async ({ page }) => {
    await page.goto('/blog');
    // The header has a link labeled "Pandocast" pointing to /
    // Use exact: true to avoid matching the article card link containing "Introducing Pandocast..."
    await expect(page.getByRole('link', { name: 'Pandocast', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Pandocast', exact: true })).toHaveAttribute('href', '/');
  });

  test('clicking blog post card navigates to post page', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.getByText('Introducing Pandocast')).toBeVisible({ timeout: 10000 });
    await page.getByText('Introducing Pandocast').click();
    await page.waitForURL('**/blog/introducing-pandocast', { timeout: 5000 });
    expect(page.url()).toContain('/blog/introducing-pandocast');
  });

  // --- Blog Post ---

  test('blog post page renders title and metadata', async ({ page }) => {
    await page.goto('/blog/introducing-pandocast');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Pandocast Team')).toBeVisible();
    await expect(page.getByText('4 min read')).toBeVisible();
  });

  test('blog post page has All posts link back to index', async ({ page }) => {
    await page.goto('/blog/introducing-pandocast');
    await expect(page.getByRole('link', { name: /all posts/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('link', { name: /all posts/i }).click();
    await page.waitForURL('**/blog', { timeout: 5000 });
    expect(page.url()).toMatch(/\/blog$/);
  });

  test('blog post page has article content', async ({ page }) => {
    await page.goto('/blog/introducing-pandocast');
    // The article should have substantive content
    await expect(page.locator('article, .prose-legal, main').first()).toBeVisible({ timeout: 10000 });
  });

  // --- 404 for invalid slug ---

  test('invalid blog slug shows 404 page', async ({ page }) => {
    await page.goto('/blog/this-post-does-not-exist');
    // Next.js shows a 404 heading
    await expect(page.getByText('404')).toBeVisible({ timeout: 10000 });
  });
});
