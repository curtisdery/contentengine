import { test, expect, Page } from '@playwright/test';

/**
 * Full app audit: exercises every page, button, and flow against the real backend.
 * Uses instant E2E auth mock (no async API call for auth) while keeping
 * real API routes so upload/content/analytics calls hit the live backend.
 */

async function blockFirebase(page: Page) {
  await page.route('**/*identitytoolkit.googleapis.com/**', (route) => route.abort());
  await page.route('**/*securetoken.googleapis.com/**', (route) => route.abort());
  await page.route('**/*firebaseinstallations.googleapis.com/**', (route) => route.abort());
  await page.route('**/*firebase.googleapis.com/**', (route) => route.abort());
  await page.route('**/*google-analytics.com/**', (route) => route.abort());
  await page.route('**/*googletagmanager.com/**', (route) => route.abort());
}

const MOCK_USER = {
  id: 'e2e-audit-user',
  email: 'dev@pandocast.local',
  full_name: 'Dev User',
  firebase_uid: null,
  avatar_url: null,
  subscription_tier: 'free' as const,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

/**
 * Set up instant auth with mock Cloud Functions.
 * The auth store sees __E2E_AUTH_MOCK__ and sets state synchronously.
 * callFunction sees __E2E_MOCK_FUNCTIONS__ and returns mock data directly.
 */
async function setupRealBackendAuth(page: Page) {
  await blockFirebase(page);

  const MOCK_ANALYTICS = {
    total_content_pieces: 0,
    total_outputs_generated: 0,
    total_published: 0,
    total_reach: 0,
    total_engagements: 0,
    avg_multiplier_score: 0,
    best_multiplier_score: 0,
    platforms_active: 0,
    top_performing_content: [],
    recent_performance: [],
  };

  const MOCK_CONTENT_LIST = {
    items: [],
    total: 0,
    page: 1,
    per_page: 20,
  };

  await page.addInitScript((m) => {
    (window as any).__E2E_AUTH_MOCK__ = true;
    (window as any).__E2E_MOCK_USER__ = m.user;
    (window as any).__E2E_MOCK_FUNCTIONS__ = {
      createProfile: () => m.user,
      getOverview: () => m.analytics,
      listConnections: () => ({ items: [], total: 0 }),
      getAutopilotSummary: () => ({ autopilot_enabled: 0, eligible_not_enabled: 0, total_auto_published: 0, platforms: [] }),
      listContent: () => m.contentList,
      getContent: () => ({}),
      createContent: () => ({}),
      updateContent: () => ({}),
      reanalyzeContent: () => ({ success: true }),
      listOutputs: () => ({ items: [], total: 0 }),
      triggerGeneration: () => ({ items: [], total: 0 }),
      getCalendarEvents: () => ({ events: [], total: 0 }),
      getCalendarStats: () => ({ upcoming_today: 0, upcoming_this_week: 0, total_published: 0, total_failed: 0, content_gaps: [] }),
      getContentAnalytics: () => m.analytics,
      getPlatformAnalytics: () => ({ platforms: [] }),
      getHeatmap: () => ({ heatmap: [] }),
      getAudienceIntelligence: () => ({}),
      listVoiceProfiles: () => ({ items: [], total: 0 }),
      createVoiceProfile: () => ({ id: 'mock-id' }),
      deleteVoiceProfile: () => ({ success: true }),
      analyzeSamples: () => ({ tone_metrics: {}, signature_phrases: [], suggested_attributes: [] }),
      createPortal: () => ({ portal_url: 'https://example.com/portal' }),
      createCheckout: () => ({ checkout_url: 'https://example.com/checkout' }),
      getSubscriptionStatus: () => ({ tier: 'free', is_active: true }),
      toggleAutopilot: () => ({ success: true }),
      panicStop: () => ({ success: true }),
      listSessions: () => ({ sessions: [] }),
      getAuditLog: () => ({ entries: [], total: 0 }),
      revokeSession: () => ({ success: true }),
      revokeAllSessions: () => ({ success: true }),
      registerFCMToken: () => ({ success: true }),
      getOAuthURL: () => ({ authorize_url: 'https://example.com/oauth' }),
      disconnectPlatform: () => ({ success: true }),
      refreshConnection: () => ({ success: true }),
      listMembers: () => ({ items: [], total: 0 }),
    };
  }, { user: MOCK_USER, analytics: MOCK_ANALYTICS, contentList: MOCK_CONTENT_LIST });
}

// ========== LANDING PAGE (must be unauthenticated) ==========

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await blockFirebase(page);
    await page.addInitScript(() => {
      (window as any).__E2E_SKIP_AUTH__ = true;
    });
  });

  test('renders hero, nav, pricing, footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('PANDO').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Free' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Creator' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pro' })).toBeVisible();
    await page.screenshot({ path: '/tmp/audit-landing.png', fullPage: true });
  });

  test('Log in link navigates to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('link', { name: 'Log in' }).click();
    await page.waitForURL('**/login', { timeout: 5000 });
    expect(page.url()).toContain('/login');
  });
});

// ========== AUTH PAGES (no auth) ==========

test.describe('Auth Pages', () => {
  test('login page renders form with all fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in|log in|welcome back/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await expect(page.getByText(/forgot password/i)).toBeVisible();
    await expect(page.getByText(/sign up/i)).toBeVisible();
    await page.screenshot({ path: '/tmp/audit-login.png' });
  });

  test('signup page renders form with all fields', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /create|sign up|get started/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('John Doe')).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('Create a strong password')).toBeVisible();
    await expect(page.getByPlaceholder('Confirm your password')).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
    await page.screenshot({ path: '/tmp/audit-signup.png' });
  });

  test('forgot password page renders', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /reset|forgot/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await page.screenshot({ path: '/tmp/audit-forgot.png' });
  });
});

// ========== AUTH GUARD ==========

test.describe('Auth Guard', () => {
  const protectedRoutes = ['/dashboard', '/content', '/content/upload', '/calendar', '/analytics', '/settings'];

  for (const route of protectedRoutes) {
    test(`redirects ${route} to /login when unauthenticated`, async ({ page }) => {
      await blockFirebase(page);
      await page.addInitScript(() => {
        (window as any).__E2E_SKIP_AUTH__ = true;
      });
      await page.goto(route);
      await page.waitForURL('**/login', { timeout: 10000 });
      expect(page.url()).toContain('/login');
    });
  }
});

// ========== AUTHENTICATED PAGES — Instant mock auth + real API routes ==========

test.describe('Authenticated App (real backend)', () => {
  test.beforeEach(async ({ page }) => {
    await setupRealBackendAuth(page);
  });

  // --- Upload page (UI only — actual submission tested in upload-submit.spec.ts) ---

  test('upload page: renders form controls', async ({ page }) => {
    await page.goto('/content/upload');
    await expect(page.getByText('Upload Content')).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole('button', { name: 'Paste Content' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'File Upload' })).toBeVisible();
    await expect(page.getByPlaceholder('Give your content a descriptive title')).toBeVisible();
    await expect(page.getByPlaceholder('Paste your blog post or article content here...')).toBeVisible();
    await expect(page.getByText('Blog / Article')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Analyze Content' })).toBeVisible();
    await page.screenshot({ path: '/tmp/audit-upload-page.png', fullPage: true });
  });

  test('upload page: back button navigates to content list', async ({ page }) => {
    await page.goto('/content/upload');
    await expect(page.getByText('Upload Content')).toBeVisible({ timeout: 15000 });

    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') });
    await backButton.click();
    await page.waitForURL('**/content', { timeout: 5000 });
    expect(page.url()).toContain('/content');
  });

  test('upload page: file upload mode toggles', async ({ page }) => {
    await page.goto('/content/upload');
    await expect(page.getByText('Upload Content')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'File Upload' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText(/drag.*drop|click.*upload|drop.*file/i)).toBeVisible();

    await page.getByRole('button', { name: 'Paste Content' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByPlaceholder('Paste your blog post or article content here...')).toBeVisible();
  });

  // --- Dashboard ---

  test('dashboard: auto-authenticates and shows welcome', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: '/tmp/audit-dashboard.png', fullPage: true });

    await expect(page.getByText('Content Uploads')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Quick Actions')).toBeVisible();
  });

  test('dashboard: CTA card navigates to upload (empty state)', async ({ page }) => {
    // Mock analytics to ensure empty state so CTA card appears
    await page.route('**/api/v1/analytics**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_content_pieces: 0, total_outputs_generated: 0, total_published: 0,
          total_reach: 0, total_engagements: 0, avg_multiplier_score: 0,
          best_multiplier_score: 0, platforms_active: 0,
          top_performing_content: [], recent_performance: [],
        }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });

    await expect(page.getByText('Upload your first piece of content')).toBeVisible({ timeout: 10000 });
    await page.getByText('Upload your first piece of content').click();
    await page.waitForURL('**/content/upload', { timeout: 5000 });
    expect(page.url()).toContain('/content/upload');
  });

  test('dashboard: Get Started button navigates to upload (empty state)', async ({ page }) => {
    // Mock analytics to ensure empty state so Get Started button appears
    await page.route('**/api/v1/analytics**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_content_pieces: 0, total_outputs_generated: 0, total_published: 0,
          total_reach: 0, total_engagements: 0, avg_multiplier_score: 0,
          best_multiplier_score: 0, platforms_active: 0,
          top_performing_content: [], recent_performance: [],
        }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Get Started' }).click();
    await page.waitForURL('**/content/upload', { timeout: 5000 });
    expect(page.url()).toContain('/content/upload');
  });

  test('dashboard: Quick Action "Upload Content" navigates', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });

    await page.getByText('Upload Content').click();
    await page.waitForURL('**/content/upload', { timeout: 5000 });
    expect(page.url()).toContain('/content/upload');
  });

  test('dashboard: Quick Action "Connect Platform" navigates', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });

    await page.getByText('Connect Platform').click();
    await page.waitForURL('**/settings/connections', { timeout: 5000 });
    expect(page.url()).toContain('/settings/connections');
  });

  test('dashboard: Quick Action "View Analytics" navigates', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });

    await page.getByText('View Analytics').click();
    await page.waitForURL('**/analytics', { timeout: 5000 });
    expect(page.url()).toContain('/analytics');
  });

  // --- Sidebar Navigation ---

  test('sidebar: navigates to Content', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });

    await page.locator('aside').getByRole('link', { name: 'Content' }).click();
    await page.waitForURL('**/content', { timeout: 5000 });
    expect(page.url()).toContain('/content');
  });

  test('sidebar: navigates to Voice', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });

    await page.locator('aside').getByRole('link', { name: 'Voice' }).click();
    await page.waitForURL('**/voice/**', { timeout: 5000 });
    expect(page.url()).toContain('/voice');
  });

  test('sidebar: navigates to Calendar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });

    await page.locator('aside').getByRole('link', { name: 'Calendar' }).click();
    await page.waitForURL('**/calendar', { timeout: 5000 });
    expect(page.url()).toContain('/calendar');
  });

  test('sidebar: navigates to Analytics', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });

    await page.locator('aside').getByRole('link', { name: 'Analytics' }).click();
    await page.waitForURL('**/analytics', { timeout: 5000 });
    expect(page.url()).toContain('/analytics');
  });

  test('sidebar: navigates to Settings', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });

    await page.locator('aside').getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL('**/settings', { timeout: 5000 });
    expect(page.url()).toContain('/settings');
  });

  test('sidebar: returns to Dashboard', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('Settings', { timeout: 15000 });

    await page.locator('aside').getByRole('link', { name: 'Dashboard' }).click();
    await page.waitForURL('**/dashboard', { timeout: 5000 });
    expect(page.url()).toContain('/dashboard');
  });

  test('sidebar: collapse toggle works', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });

    const collapseBtn = page.getByText('Collapse');
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await page.waitForTimeout(500);
    await expect(collapseBtn).not.toBeVisible();
  });

  // --- Voice Pages ---

  test('voice: /voice redirects to /voice/profiles', async ({ page }) => {
    await page.goto('/voice');
    await page.waitForURL('**/voice/profiles', { timeout: 10000 });
    expect(page.url()).toContain('/voice/profiles');
  });

  test('voice: profiles page loads', async ({ page }) => {
    await page.goto('/voice/profiles');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/audit-voice-profiles.png', fullPage: true });
    expect(page.url()).toContain('/voice/profiles');
  });

  test('voice: setup page loads', async ({ page }) => {
    await page.goto('/voice/setup');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/audit-voice-setup.png', fullPage: true });
    expect(page.url()).toContain('/voice/setup');
  });

  // --- Calendar ---

  test('calendar: page loads', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/audit-calendar.png', fullPage: true });
    expect(page.url()).toContain('/calendar');
  });

  test('calendar: queue page loads', async ({ page }) => {
    await page.goto('/calendar/queue');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/audit-calendar-queue.png', fullPage: true });
    expect(page.url()).toContain('/calendar/queue');
  });

  // --- Analytics ---

  test('analytics: page loads', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/audit-analytics.png', fullPage: true });
    expect(page.url()).toContain('/analytics');
  });

  // --- Settings ---

  test('settings: main page loads with all sections', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('Settings', { timeout: 10000 });
    await page.screenshot({ path: '/tmp/audit-settings.png', fullPage: true });

    await expect(page.getByText(/Plan$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage Subscription' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upgrade to Pro' })).toBeVisible();
    await expect(page.getByText('Connected Platforms')).toBeVisible();
    await expect(page.getByText('Autopilot')).toBeVisible();
    await expect(page.getByRole('button', { name: 'View all security settings' })).toBeVisible();
  });

  test('settings: Connected Platforms card navigates', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('Settings', { timeout: 10000 });

    await page.getByText('Connected Platforms').click();
    await page.waitForURL('**/settings/connections', { timeout: 5000 });
    expect(page.url()).toContain('/settings/connections');
  });

  test('settings: Autopilot card navigates', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('Settings', { timeout: 10000 });

    await page.getByText('Autopilot').click();
    await page.waitForURL('**/settings/autopilot', { timeout: 5000 });
    expect(page.url()).toContain('/settings/autopilot');
  });

  test('settings: View all security settings navigates', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('Settings', { timeout: 10000 });

    await page.getByRole('button', { name: 'View all security settings' }).click();
    await page.waitForURL('**/settings/security', { timeout: 5000 });
    expect(page.url()).toContain('/settings/security');
  });

  test('settings: connections back button works', async ({ page }) => {
    await page.goto('/settings/connections');
    await page.waitForLoadState('networkidle');

    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') });
    await backButton.click();
    await page.waitForURL(/\/settings$/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/settings$/);
  });

  test('settings: autopilot back button works', async ({ page }) => {
    await page.goto('/settings/autopilot');
    await page.waitForLoadState('networkidle');

    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') });
    await backButton.click();
    await page.waitForURL(/\/settings$/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/settings$/);
  });

  test('settings: security back button works', async ({ page }) => {
    await page.goto('/settings/security');
    await page.waitForLoadState('networkidle');

    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') });
    await backButton.click();
    await page.waitForURL(/\/settings$/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/settings$/);
  });

  // --- Logout ---

  test('logout: clears session and redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });

    const logoutBtn = page.locator('aside button svg.lucide-log-out').locator('..');
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });
    await logoutBtn.click();
    await page.waitForURL('**/login', { timeout: 5000 });
    expect(page.url()).toContain('/login');
  });
});
