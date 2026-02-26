import { test, expect } from '@playwright/test';
import { setupAuthenticated } from '../fixtures/auth';

/**
 * Voice profile page interaction tests.
 */

test.describe('Voice Profiles Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('voice profiles page shows existing profile', async ({ page }) => {
    await page.goto('/voice/profiles');
    await page.waitForLoadState('networkidle');

    // Mock has one profile: "Professional Voice"
    await expect(page.getByText('Professional Voice')).toBeVisible({ timeout: 15000 });
  });

  test('voice profiles page shows Default badge on default profile', async ({ page }) => {
    await page.goto('/voice/profiles');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Default')).toBeVisible({ timeout: 15000 });
  });

  test('voice profiles page has Create New Profile button', async ({ page }) => {
    await page.goto('/voice/profiles');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /create new profile/i })).toBeVisible({ timeout: 15000 });
  });

  test('Create New Profile navigates to voice setup', async ({ page }) => {
    await page.goto('/voice/profiles');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /create new profile/i }).click();
    await page.waitForURL('**/voice/setup', { timeout: 5000 });
    expect(page.url()).toContain('/voice/setup');
  });
});
