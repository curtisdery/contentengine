import { test, expect } from '@playwright/test';
import { setupUnauthenticated } from '../fixtures/auth';
import { PROTECTED_ROUTES } from '../fixtures/test-data';

test.describe('Auth Guard — Protected Routes', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnauthenticated(page);
  });

  for (const route of PROTECTED_ROUTES) {
    test(`redirects ${route} to /login when unauthenticated`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL('**/login', { timeout: 10000 });
      expect(page.url()).toContain('/login');
    });
  }
});

test.describe('Auth Guard — Public Routes', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnauthenticated(page);
  });

  test('does not redirect / away', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('does not redirect /login away', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('does not redirect /signup away', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).toBe('/signup');
  });
});
