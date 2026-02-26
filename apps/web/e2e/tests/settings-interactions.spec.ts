import { test, expect } from '@playwright/test';
import { setupAuthenticated } from '../fixtures/auth';

/**
 * Settings sub-page interaction tests — goes beyond smoke tests
 * to verify that data renders and interactive elements work.
 */

test.describe('Settings Connections Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('connections page shows connected platforms', async ({ page }) => {
    await page.goto('/settings/connections');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });

    // Mock has 3 connections: twitter (active), linkedin (active), bluesky (inactive)
    await expect(page.getByText('@testuser').first()).toBeVisible({ timeout: 10000 });
  });

  test('connections page shows platform count summary', async ({ page }) => {
    await page.goto('/settings/connections');
    await expect(page.getByText(/of 16 platforms connected/i)).toBeVisible({ timeout: 15000 });
  });

  test('connections page shows tier sections', async ({ page }) => {
    await page.goto('/settings/connections');
    await expect(page.getByText('Micro-Content')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Professional Networks')).toBeVisible();
  });
});

test.describe('Settings Autopilot Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('autopilot page shows summary stats', async ({ page }) => {
    await page.goto('/settings/autopilot');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });

    await expect(page.getByText('On Autopilot')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Eligible').first()).toBeVisible();
    await expect(page.getByText('Auto-Published')).toBeVisible();
  });

  test('autopilot page shows trust level info', async ({ page }) => {
    await page.goto('/settings/autopilot');
    await expect(page.getByText(/how trust levels work/i)).toBeVisible({ timeout: 15000 });
  });

  test('autopilot page has emergency stop section', async ({ page }) => {
    await page.goto('/settings/autopilot');
    await expect(page.getByRole('heading', { name: 'Emergency Stop' })).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Settings Security Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticated(page);
  });

  test('security page shows active sessions', async ({ page }) => {
    await page.goto('/settings/security');
    await expect(page.getByText('Active Sessions')).toBeVisible({ timeout: 15000 });

    // Mock has 2 sessions: Chrome on macOS (current), Safari on iPhone
    await expect(page.getByText('Current')).toBeVisible({ timeout: 10000 });
  });

  test('security page shows security events', async ({ page }) => {
    await page.goto('/settings/security');
    await expect(page.getByText('Security Events')).toBeVisible({ timeout: 15000 });

    // Mock has 2 audit entries
    await expect(page.getByText(/signed in/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('security page shows Two-Factor Authentication section', async ({ page }) => {
    await page.goto('/settings/security');
    await expect(page.getByText('Two-Factor Authentication')).toBeVisible({ timeout: 15000 });
  });

  test('security page shows Revoke All Others button for multiple sessions', async ({ page }) => {
    await page.goto('/settings/security');
    await expect(page.getByText('Active Sessions')).toBeVisible({ timeout: 15000 });

    // Should show revoke all button since we have 2 sessions (one non-current)
    await expect(page.getByRole('button', { name: /revoke all/i })).toBeVisible({ timeout: 10000 });
  });
});
