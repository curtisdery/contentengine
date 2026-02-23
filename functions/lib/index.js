"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateVoiceProfile = exports.listVoiceProfiles = exports.getVoiceProfile = exports.createVoiceProfile = exports.refreshConnection = exports.disconnectPlatform = exports.listConnections = exports.handleOAuthCallback = exports.getOAuthURL = exports.getAudienceIntelligence = exports.getHeatmap = exports.getPlatformAnalytics = exports.getContentAnalytics = exports.getOverview = exports.getCalendarStats = exports.publishNow = exports.cancelEvent = exports.rescheduleOutput = exports.getCalendarEvents = exports.autoSchedule = exports.scheduleBatch = exports.scheduleOutput = exports.bulkApproveOutputs = exports.regenerateOutput = exports.rejectOutput = exports.approveOutput = exports.editOutput = exports.getOutput = exports.listOutputs = exports.reanalyzeContent = exports.triggerGeneration = exports.updateContent = exports.listContent = exports.getContent = exports.createContent = exports.getUploadURL = exports.stripeWebhook = exports.getSubscriptionStatus = exports.createPortal = exports.createCheckout = exports.revokeAllSessions = exports.getAuditLog = exports.revokeSession = exports.listSessions = exports.revokeFCMToken = exports.registerFCMToken = exports.verifyMFA = exports.enableMFA = exports.updateProfile = exports.createProfile = void 0;
exports.streamToBigQuery = exports.syncFollowers = exports.cleanup = exports.trendDetection = exports.recalcScores = exports.refreshTokens = exports.publishDue = exports.taskAnalyticsPolling = exports.taskPublishing = exports.taskOutputGeneration = exports.taskContentAnalysis = exports.deleteAccount = exports.exportData = exports.panicStop = exports.getAutopilotSummary = exports.toggleAutopilot = exports.getEligibility = exports.transferOwnership = exports.removeMember = exports.updateRole = exports.listMembers = exports.acceptInvite = exports.inviteMember = exports.deleteVoiceProfile = exports.analyzeSamples = void 0;
// ─── API: Auth (10 onCall) ───────────────────────────────────────────────────
var auth_js_1 = require("./api/auth.js");
Object.defineProperty(exports, "createProfile", { enumerable: true, get: function () { return auth_js_1.createProfile; } });
Object.defineProperty(exports, "updateProfile", { enumerable: true, get: function () { return auth_js_1.updateProfile; } });
Object.defineProperty(exports, "enableMFA", { enumerable: true, get: function () { return auth_js_1.enableMFA; } });
Object.defineProperty(exports, "verifyMFA", { enumerable: true, get: function () { return auth_js_1.verifyMFA; } });
Object.defineProperty(exports, "registerFCMToken", { enumerable: true, get: function () { return auth_js_1.registerFCMToken; } });
Object.defineProperty(exports, "revokeFCMToken", { enumerable: true, get: function () { return auth_js_1.revokeFCMToken; } });
Object.defineProperty(exports, "listSessions", { enumerable: true, get: function () { return auth_js_1.listSessions; } });
Object.defineProperty(exports, "revokeSession", { enumerable: true, get: function () { return auth_js_1.revokeSession; } });
Object.defineProperty(exports, "getAuditLog", { enumerable: true, get: function () { return auth_js_1.getAuditLog; } });
Object.defineProperty(exports, "revokeAllSessions", { enumerable: true, get: function () { return auth_js_1.revokeAllSessions; } });
// ─── API: Billing (3 onCall + 1 onRequest) ──────────────────────────────────
var billing_js_1 = require("./api/billing.js");
Object.defineProperty(exports, "createCheckout", { enumerable: true, get: function () { return billing_js_1.createCheckout; } });
Object.defineProperty(exports, "createPortal", { enumerable: true, get: function () { return billing_js_1.createPortal; } });
Object.defineProperty(exports, "getSubscriptionStatus", { enumerable: true, get: function () { return billing_js_1.getSubscriptionStatus; } });
Object.defineProperty(exports, "stripeWebhook", { enumerable: true, get: function () { return billing_js_1.stripeWebhook; } });
// ─── API: Content (7 onCall) ─────────────────────────────────────────────────
var content_js_1 = require("./api/content.js");
Object.defineProperty(exports, "getUploadURL", { enumerable: true, get: function () { return content_js_1.getUploadURL; } });
Object.defineProperty(exports, "createContent", { enumerable: true, get: function () { return content_js_1.createContent; } });
Object.defineProperty(exports, "getContent", { enumerable: true, get: function () { return content_js_1.getContent; } });
Object.defineProperty(exports, "listContent", { enumerable: true, get: function () { return content_js_1.listContent; } });
Object.defineProperty(exports, "updateContent", { enumerable: true, get: function () { return content_js_1.updateContent; } });
Object.defineProperty(exports, "triggerGeneration", { enumerable: true, get: function () { return content_js_1.triggerGeneration; } });
Object.defineProperty(exports, "reanalyzeContent", { enumerable: true, get: function () { return content_js_1.reanalyzeContent; } });
// ─── API: Outputs (7 onCall) ─────────────────────────────────────────────────
var outputs_js_1 = require("./api/outputs.js");
Object.defineProperty(exports, "listOutputs", { enumerable: true, get: function () { return outputs_js_1.listOutputs; } });
Object.defineProperty(exports, "getOutput", { enumerable: true, get: function () { return outputs_js_1.getOutput; } });
Object.defineProperty(exports, "editOutput", { enumerable: true, get: function () { return outputs_js_1.editOutput; } });
Object.defineProperty(exports, "approveOutput", { enumerable: true, get: function () { return outputs_js_1.approveOutput; } });
Object.defineProperty(exports, "rejectOutput", { enumerable: true, get: function () { return outputs_js_1.rejectOutput; } });
Object.defineProperty(exports, "regenerateOutput", { enumerable: true, get: function () { return outputs_js_1.regenerateOutput; } });
Object.defineProperty(exports, "bulkApproveOutputs", { enumerable: true, get: function () { return outputs_js_1.bulkApproveOutputs; } });
// ─── API: Calendar (8 onCall) ────────────────────────────────────────────────
var calendar_js_1 = require("./api/calendar.js");
Object.defineProperty(exports, "scheduleOutput", { enumerable: true, get: function () { return calendar_js_1.scheduleOutput; } });
Object.defineProperty(exports, "scheduleBatch", { enumerable: true, get: function () { return calendar_js_1.scheduleBatch; } });
Object.defineProperty(exports, "autoSchedule", { enumerable: true, get: function () { return calendar_js_1.autoSchedule; } });
Object.defineProperty(exports, "getCalendarEvents", { enumerable: true, get: function () { return calendar_js_1.getCalendarEvents; } });
Object.defineProperty(exports, "rescheduleOutput", { enumerable: true, get: function () { return calendar_js_1.rescheduleOutput; } });
Object.defineProperty(exports, "cancelEvent", { enumerable: true, get: function () { return calendar_js_1.cancelEvent; } });
Object.defineProperty(exports, "publishNow", { enumerable: true, get: function () { return calendar_js_1.publishNow; } });
Object.defineProperty(exports, "getCalendarStats", { enumerable: true, get: function () { return calendar_js_1.getCalendarStats; } });
// ─── API: Analytics (5 onCall) ───────────────────────────────────────────────
var analytics_js_1 = require("./api/analytics.js");
Object.defineProperty(exports, "getOverview", { enumerable: true, get: function () { return analytics_js_1.getOverview; } });
Object.defineProperty(exports, "getContentAnalytics", { enumerable: true, get: function () { return analytics_js_1.getContentAnalytics; } });
Object.defineProperty(exports, "getPlatformAnalytics", { enumerable: true, get: function () { return analytics_js_1.getPlatformAnalytics; } });
Object.defineProperty(exports, "getHeatmap", { enumerable: true, get: function () { return analytics_js_1.getHeatmap; } });
Object.defineProperty(exports, "getAudienceIntelligence", { enumerable: true, get: function () { return analytics_js_1.getAudienceIntelligence; } });
// ─── API: Connections (4 onCall + 1 onRequest) ──────────────────────────────
var connections_js_1 = require("./api/connections.js");
Object.defineProperty(exports, "getOAuthURL", { enumerable: true, get: function () { return connections_js_1.getOAuthURL; } });
Object.defineProperty(exports, "handleOAuthCallback", { enumerable: true, get: function () { return connections_js_1.handleOAuthCallback; } });
Object.defineProperty(exports, "listConnections", { enumerable: true, get: function () { return connections_js_1.listConnections; } });
Object.defineProperty(exports, "disconnectPlatform", { enumerable: true, get: function () { return connections_js_1.disconnectPlatform; } });
Object.defineProperty(exports, "refreshConnection", { enumerable: true, get: function () { return connections_js_1.refreshConnection; } });
// ─── API: Voice (6 onCall) ───────────────────────────────────────────────────
var voice_js_1 = require("./api/voice.js");
Object.defineProperty(exports, "createVoiceProfile", { enumerable: true, get: function () { return voice_js_1.createVoiceProfile; } });
Object.defineProperty(exports, "getVoiceProfile", { enumerable: true, get: function () { return voice_js_1.getVoiceProfile; } });
Object.defineProperty(exports, "listVoiceProfiles", { enumerable: true, get: function () { return voice_js_1.listVoiceProfiles; } });
Object.defineProperty(exports, "updateVoiceProfile", { enumerable: true, get: function () { return voice_js_1.updateVoiceProfile; } });
Object.defineProperty(exports, "analyzeSamples", { enumerable: true, get: function () { return voice_js_1.analyzeSamples; } });
Object.defineProperty(exports, "deleteVoiceProfile", { enumerable: true, get: function () { return voice_js_1.deleteVoiceProfile; } });
// ─── API: Team (6 onCall) ────────────────────────────────────────────────────
var team_js_1 = require("./api/team.js");
Object.defineProperty(exports, "inviteMember", { enumerable: true, get: function () { return team_js_1.inviteMember; } });
Object.defineProperty(exports, "acceptInvite", { enumerable: true, get: function () { return team_js_1.acceptInvite; } });
Object.defineProperty(exports, "listMembers", { enumerable: true, get: function () { return team_js_1.listMembers; } });
Object.defineProperty(exports, "updateRole", { enumerable: true, get: function () { return team_js_1.updateRole; } });
Object.defineProperty(exports, "removeMember", { enumerable: true, get: function () { return team_js_1.removeMember; } });
Object.defineProperty(exports, "transferOwnership", { enumerable: true, get: function () { return team_js_1.transferOwnership; } });
// ─── API: Autopilot (4 onCall) ──────────────────────────────────────────────
var autopilot_js_1 = require("./api/autopilot.js");
Object.defineProperty(exports, "getEligibility", { enumerable: true, get: function () { return autopilot_js_1.getEligibility; } });
Object.defineProperty(exports, "toggleAutopilot", { enumerable: true, get: function () { return autopilot_js_1.toggleAutopilot; } });
Object.defineProperty(exports, "getAutopilotSummary", { enumerable: true, get: function () { return autopilot_js_1.getAutopilotSummary; } });
Object.defineProperty(exports, "panicStop", { enumerable: true, get: function () { return autopilot_js_1.panicStop; } });
// ─── API: GDPR (2 onCall) ───────────────────────────────────────────────────
var gdpr_js_1 = require("./api/gdpr.js");
Object.defineProperty(exports, "exportData", { enumerable: true, get: function () { return gdpr_js_1.exportData; } });
Object.defineProperty(exports, "deleteAccount", { enumerable: true, get: function () { return gdpr_js_1.deleteAccount; } });
// ─── Cloud Tasks (4 onRequest) ──────────────────────────────────────────────
var contentAnalysis_js_1 = require("./tasks/contentAnalysis.js");
Object.defineProperty(exports, "taskContentAnalysis", { enumerable: true, get: function () { return contentAnalysis_js_1.taskContentAnalysis; } });
var outputGeneration_js_1 = require("./tasks/outputGeneration.js");
Object.defineProperty(exports, "taskOutputGeneration", { enumerable: true, get: function () { return outputGeneration_js_1.taskOutputGeneration; } });
var publishing_js_1 = require("./tasks/publishing.js");
Object.defineProperty(exports, "taskPublishing", { enumerable: true, get: function () { return publishing_js_1.taskPublishing; } });
var analyticsPolling_js_1 = require("./tasks/analyticsPolling.js");
Object.defineProperty(exports, "taskAnalyticsPolling", { enumerable: true, get: function () { return analyticsPolling_js_1.taskAnalyticsPolling; } });
// ─── Scheduled Functions (6 onSchedule) ─────────────────────────────────────
var publishDue_js_1 = require("./scheduled/publishDue.js");
Object.defineProperty(exports, "publishDue", { enumerable: true, get: function () { return publishDue_js_1.publishDue; } });
var refreshTokens_js_1 = require("./scheduled/refreshTokens.js");
Object.defineProperty(exports, "refreshTokens", { enumerable: true, get: function () { return refreshTokens_js_1.refreshTokens; } });
var recalcScores_js_1 = require("./scheduled/recalcScores.js");
Object.defineProperty(exports, "recalcScores", { enumerable: true, get: function () { return recalcScores_js_1.recalcScores; } });
var trendDetection_js_1 = require("./scheduled/trendDetection.js");
Object.defineProperty(exports, "trendDetection", { enumerable: true, get: function () { return trendDetection_js_1.trendDetection; } });
var cleanup_js_1 = require("./scheduled/cleanup.js");
Object.defineProperty(exports, "cleanup", { enumerable: true, get: function () { return cleanup_js_1.cleanup; } });
var syncFollowers_js_1 = require("./scheduled/syncFollowers.js");
Object.defineProperty(exports, "syncFollowers", { enumerable: true, get: function () { return syncFollowers_js_1.syncFollowers; } });
// ─── Firestore Triggers (1) ─────────────────────────────────────────────────
var bigquery_js_1 = require("./triggers/bigquery.js");
Object.defineProperty(exports, "streamToBigQuery", { enumerable: true, get: function () { return bigquery_js_1.streamToBigQuery; } });
//# sourceMappingURL=index.js.map