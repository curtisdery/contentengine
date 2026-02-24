/**
 * Pandocast Cloud Functions — main entry point.
 * Re-exports all functions for Firebase discovery.
 *
 * Total: 78 Cloud Functions
 *   - 64 onCall (client-facing API)
 *   - 4 onRequest (tasks + webhooks)
 *   - 6 onSchedule (cron jobs)
 *   - 1 Firestore trigger
 *   - 3 onRequest (Stripe webhook + OAuth callback + task handlers share onRequest)
 */

// ─── API: Auth (10 onCall) ───────────────────────────────────────────────────
export {
  createProfile,
  updateProfile,
  enableMFA,
  verifyMFA,
  registerFCMToken,
  revokeFCMToken,
  listSessions,
  revokeSession,
  getAuditLog,
  revokeAllSessions,
} from "./api/auth.js";

// ─── API: Billing (3 onCall + 1 onRequest) ──────────────────────────────────
export {
  createCheckout,
  createPortal,
  getSubscriptionStatus,
  stripeWebhook,
} from "./api/billing.js";

// ─── API: Content (7 onCall) ─────────────────────────────────────────────────
export {
  getUploadURL,
  createContent,
  getContent,
  listContent,
  updateContent,
  triggerGeneration,
  reanalyzeContent,
} from "./api/content.js";

// ─── API: Outputs (7 onCall) ─────────────────────────────────────────────────
export {
  listOutputs,
  getOutput,
  editOutput,
  approveOutput,
  rejectOutput,
  regenerateOutput,
  bulkApproveOutputs,
} from "./api/outputs.js";

// ─── API: Calendar (8 onCall) ────────────────────────────────────────────────
export {
  scheduleOutput,
  scheduleBatch,
  autoSchedule,
  getCalendarEvents,
  rescheduleOutput,
  cancelEvent,
  publishNow,
  getCalendarStats,
} from "./api/calendar.js";

// ─── API: Analytics (8 onCall) ───────────────────────────────────────────────
export {
  getOverview,
  getContentAnalytics,
  getPlatformAnalytics,
  getHeatmap,
  getAudienceIntelligence,
  getContentTypeAnalytics,
  getHookAnalytics,
  getContentStrategy,
} from "./api/analytics.js";

// ─── API: Connections (4 onCall + 1 onRequest) ──────────────────────────────
export {
  getOAuthURL,
  handleOAuthCallback,
  listConnections,
  disconnectPlatform,
  refreshConnection,
} from "./api/connections.js";

// ─── API: Voice (6 onCall) ───────────────────────────────────────────────────
export {
  createVoiceProfile,
  getVoiceProfile,
  listVoiceProfiles,
  updateVoiceProfile,
  analyzeSamples,
  deleteVoiceProfile,
} from "./api/voice.js";

// ─── API: Team (6 onCall) ────────────────────────────────────────────────────
export {
  inviteMember,
  acceptInvite,
  listMembers,
  updateRole,
  removeMember,
  transferOwnership,
} from "./api/team.js";

// ─── API: Autopilot (4 onCall) ──────────────────────────────────────────────
export {
  getEligibility,
  toggleAutopilot,
  getAutopilotSummary,
  panicStop,
} from "./api/autopilot.js";

// ─── API: Notifications (3 onCall) ──────────────────────────────────────────
export {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "./api/notifications.js";

// ─── API: GDPR (2 onCall) ───────────────────────────────────────────────────
export {
  exportData,
  deleteAccount,
} from "./api/gdpr.js";

// ─── Cloud Tasks (4 onRequest) ──────────────────────────────────────────────
export { taskContentAnalysis } from "./tasks/contentAnalysis.js";
export { taskOutputGeneration } from "./tasks/outputGeneration.js";
export { taskPublishing } from "./tasks/publishing.js";
export { taskAnalyticsPolling } from "./tasks/analyticsPolling.js";

// ─── Scheduled Functions (6 onSchedule) ─────────────────────────────────────
export { publishDue } from "./scheduled/publishDue.js";
export { refreshTokens } from "./scheduled/refreshTokens.js";
export { recalcScores } from "./scheduled/recalcScores.js";
export { trendDetection } from "./scheduled/trendDetection.js";
export { cleanup } from "./scheduled/cleanup.js";
export { syncFollowers } from "./scheduled/syncFollowers.js";

// ─── Firestore Triggers (1) ─────────────────────────────────────────────────
export { streamToBigQuery } from "./triggers/bigquery.js";
