import { Page } from '@playwright/test';
import {
  MOCK_USER,
  MOCK_CONTENT_LIST,
  MOCK_AUTOPILOT_SUMMARY,
  MOCK_ANALYTICS_SUMMARY,
  MOCK_CONNECTIONS,
  MOCK_SIGNUP_RESPONSE,
} from '../helpers/mock-responses';

/**
 * Inject mock Cloud Function handlers into the window object.
 *
 * The `callFunction` wrapper in cloud-functions.ts checks for
 * `window.__E2E_MOCK_FUNCTIONS__` and returns mock data directly,
 * bypassing Firebase httpsCallable entirely.
 *
 * Each key is a Cloud Function name; the value is a function that
 * receives the input data and returns the mock response.
 */
export async function mockAllApiRoutes(page: Page) {
  const mocks = {
    user: MOCK_USER,
    contentList: MOCK_CONTENT_LIST,
    autopilot: MOCK_AUTOPILOT_SUMMARY,
    analytics: MOCK_ANALYTICS_SUMMARY,
    connections: MOCK_CONNECTIONS,
    signup: MOCK_SIGNUP_RESPONSE,
  };

  await page.addInitScript((m) => {
    (window as any).__E2E_MOCK_FUNCTIONS__ = {
      // Auth
      createProfile: () => m.user,

      // Content
      listContent: () => m.contentList,
      getContent: () => m.contentList.items[0] ?? {},
      createContent: () => m.contentList.items[0] ?? {},
      updateContent: () => m.contentList.items[0] ?? {},
      reanalyzeContent: () => ({ success: true }),

      // Outputs
      listOutputs: () => ({ items: [], total: 0 }),
      approveOutput: () => ({ success: true }),
      editOutput: () => ({ success: true }),
      bulkApproveOutputs: () => ({ approved_count: 0 }),
      regenerateOutput: () => ({ success: true }),

      // Generation
      triggerGeneration: () => ({ items: [], total: 0 }),

      // Calendar
      getCalendarEvents: () => ({ events: [], total: 0 }),
      getCalendarStats: () => ({
        upcoming_today: 0,
        upcoming_this_week: 0,
        total_published: m.analytics.total_published,
        total_failed: 0,
        content_gaps: [],
      }),
      rescheduleOutput: () => ({ success: true }),
      cancelEvent: () => ({ success: true }),
      publishNow: () => ({ success: true }),
      scheduleBatch: () => ({ scheduled_count: 0 }),
      autoSchedule: () => ({ events: [], total: 0 }),

      // Analytics
      getOverview: () => m.analytics,
      getContentAnalytics: () => m.analytics,
      getPlatformAnalytics: () => ({ platforms: [] }),
      getHeatmap: () => ({ heatmap: [] }),
      getAudienceIntelligence: () => ({}),

      // Connections
      listConnections: () => ({ items: m.connections, total: m.connections.length }),
      getOAuthURL: () => ({ authorize_url: 'https://example.com/oauth' }),
      disconnectPlatform: () => ({ success: true }),
      refreshConnection: () => ({ success: true }),

      // Voice
      listVoiceProfiles: () => ({ items: [], total: 0 }),
      createVoiceProfile: () => ({ id: 'mock-profile-id' }),
      deleteVoiceProfile: () => ({ success: true }),
      analyzeSamples: () => ({
        tone_metrics: {},
        signature_phrases: [],
        suggested_attributes: [],
      }),

      // Billing
      createPortal: () => ({ portal_url: 'https://example.com/portal' }),
      createCheckout: () => ({ checkout_url: 'https://example.com/checkout' }),
      getSubscriptionStatus: () => ({ tier: 'growth', is_active: true }),

      // Autopilot
      getAutopilotSummary: () => m.autopilot,
      toggleAutopilot: () => ({ success: true }),
      getEligibility: () => ({ eligible: false }),
      panicStop: () => ({ success: true }),

      // Security
      listSessions: () => ({ sessions: [] }),
      getAuditLog: () => ({ entries: [], total: 0 }),
      revokeSession: () => ({ success: true }),
      revokeAllSessions: () => ({ success: true }),

      // FCM
      registerFCMToken: () => ({ success: true }),

      // Team
      listMembers: () => ({ items: [], total: 0 }),
    };
  }, mocks);
}

/**
 * Inject mock Cloud Function handlers that simulate unauthenticated state.
 * All functions throw an error with code 401.
 */
export async function mockApiUnauthenticated(page: Page) {
  await page.addInitScript(() => {
    const handler = () => {
      throw { code: 'functions/unauthenticated', message: 'Not authenticated' };
    };
    (window as any).__E2E_MOCK_FUNCTIONS__ = new Proxy({}, { get: () => handler });
  });
}
