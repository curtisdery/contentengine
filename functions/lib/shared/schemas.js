"use strict";
/** Zod schemas matching frontend api.ts types — used for request validation. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteAccountSchema = exports.RevokeFCMTokenSchema = exports.RegisterFCMTokenSchema = exports.UpdateProfileSchema = exports.CreateCheckoutSchema = exports.AutopilotEligibilitySchema = exports.AutopilotToggleSchema = exports.TransferOwnershipSchema = exports.RemoveMemberSchema = exports.UpdateRoleSchema = exports.AcceptInviteSchema = exports.InviteMemberSchema = exports.ContentAnalyticsSchema = exports.AnalyticsQuerySchema = exports.DisconnectPlatformSchema = exports.GetOAuthURLSchema = exports.CalendarQuerySchema = exports.RescheduleSchema = exports.AutoScheduleSchema = exports.ScheduleBatchSchema = exports.ScheduleOutputSchema = exports.BulkApproveSchema = exports.OutputUpdateSchema = exports.GenerateRequestSchema = exports.AnalyzeSamplesSchema = exports.VoiceProfileUpdateSchema = exports.VoiceProfileCreateSchema = exports.ContentUpdateRequestSchema = exports.ContentUploadRequestSchema = void 0;
const zod_1 = require("zod");
// ─── Content ─────────────────────────────────────────────────────────────────
exports.ContentUploadRequestSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(500),
    content_type: zod_1.z.enum(["blog", "video_transcript", "podcast_transcript"]),
    raw_content: zod_1.z.string().optional(),
    storage_path: zod_1.z.string().optional(),
    source_url: zod_1.z.string().url().optional(),
});
exports.ContentUpdateRequestSchema = zod_1.z.object({
    emphasis_notes: zod_1.z.string().max(2000).optional(),
    focus_hook_index: zod_1.z.number().int().min(0).optional(),
    additional_context: zod_1.z.string().max(5000).optional(),
});
// ─── Voice ───────────────────────────────────────────────────────────────────
exports.VoiceProfileCreateSchema = zod_1.z.object({
    profile_name: zod_1.z.string().min(1).max(200),
    voice_attributes: zod_1.z.array(zod_1.z.string()).default([]),
    sample_content: zod_1.z.array(zod_1.z.string()).default([]),
    banned_terms: zod_1.z.array(zod_1.z.string()).default([]),
    preferred_terms: zod_1.z.array(zod_1.z.string()).default([]),
    audience_label: zod_1.z.string().default(""),
    signature_phrases: zod_1.z.array(zod_1.z.string()).default([]),
    emoji_policy: zod_1.z.record(zod_1.z.unknown()).default({}),
    cta_library: zod_1.z.array(zod_1.z.string()).default([]),
    approved_topics: zod_1.z.array(zod_1.z.string()).default([]),
    restricted_topics: zod_1.z.array(zod_1.z.string()).default([]),
    is_default: zod_1.z.boolean().default(false),
});
exports.VoiceProfileUpdateSchema = exports.VoiceProfileCreateSchema.partial();
exports.AnalyzeSamplesSchema = zod_1.z.object({
    samples: zod_1.z.array(zod_1.z.string().min(50)).min(1).max(5),
});
// ─── Generation ──────────────────────────────────────────────────────────────
exports.GenerateRequestSchema = zod_1.z.object({
    voice_profile_id: zod_1.z.string().optional(),
    selected_platforms: zod_1.z.array(zod_1.z.string()).optional(),
    emphasis_notes: zod_1.z.string().max(2000).optional(),
});
// ─── Output ──────────────────────────────────────────────────────────────────
exports.OutputUpdateSchema = zod_1.z.object({
    content: zod_1.z.string().optional(),
    status: zod_1.z.enum(["draft", "approved", "rejected"]).optional(),
});
exports.BulkApproveSchema = zod_1.z.object({
    output_ids: zod_1.z.array(zod_1.z.string()).min(1).max(100),
});
// ─── Calendar ────────────────────────────────────────────────────────────────
exports.ScheduleOutputSchema = zod_1.z.object({
    output_id: zod_1.z.string(),
    scheduled_at: zod_1.z.string().datetime(),
});
exports.ScheduleBatchSchema = zod_1.z.object({
    items: zod_1.z.array(zod_1.z.object({
        output_id: zod_1.z.string(),
        scheduled_at: zod_1.z.string().datetime(),
    })).min(1).max(100),
});
exports.AutoScheduleSchema = zod_1.z.object({
    content_id: zod_1.z.string(),
    start_date: zod_1.z.string().datetime(),
});
exports.RescheduleSchema = zod_1.z.object({
    scheduled_at: zod_1.z.string().datetime(),
});
exports.CalendarQuerySchema = zod_1.z.object({
    start: zod_1.z.string().datetime(),
    end: zod_1.z.string().datetime(),
    platform_id: zod_1.z.string().optional(),
});
// ─── Connections ─────────────────────────────────────────────────────────────
exports.GetOAuthURLSchema = zod_1.z.object({
    platform_id: zod_1.z.string(),
});
exports.DisconnectPlatformSchema = zod_1.z.object({
    connection_id: zod_1.z.string(),
});
// ─── Analytics ───────────────────────────────────────────────────────────────
exports.AnalyticsQuerySchema = zod_1.z.object({
    days: zod_1.z.number().int().min(1).max(365).default(30),
    platform_id: zod_1.z.string().optional(),
});
exports.ContentAnalyticsSchema = zod_1.z.object({
    content_id: zod_1.z.string(),
});
// ─── Team ────────────────────────────────────────────────────────────────────
exports.InviteMemberSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    role: zod_1.z.enum(["admin", "editor", "viewer"]),
});
exports.AcceptInviteSchema = zod_1.z.object({
    token: zod_1.z.string(),
});
exports.UpdateRoleSchema = zod_1.z.object({
    member_id: zod_1.z.string(),
    role: zod_1.z.enum(["admin", "editor", "viewer"]),
});
exports.RemoveMemberSchema = zod_1.z.object({
    member_id: zod_1.z.string(),
});
exports.TransferOwnershipSchema = zod_1.z.object({
    new_owner_id: zod_1.z.string(),
});
// ─── Autopilot ───────────────────────────────────────────────────────────────
exports.AutopilotToggleSchema = zod_1.z.object({
    platform_id: zod_1.z.string(),
    enabled: zod_1.z.boolean(),
});
exports.AutopilotEligibilitySchema = zod_1.z.object({
    platform_id: zod_1.z.string(),
});
// ─── Billing ─────────────────────────────────────────────────────────────────
exports.CreateCheckoutSchema = zod_1.z.object({
    tier: zod_1.z.enum(["growth", "pro"]),
    success_url: zod_1.z.string().url(),
    cancel_url: zod_1.z.string().url(),
});
// ─── Auth ────────────────────────────────────────────────────────────────────
exports.UpdateProfileSchema = zod_1.z.object({
    full_name: zod_1.z.string().min(1).max(200).optional(),
    avatar_url: zod_1.z.string().url().optional(),
});
exports.RegisterFCMTokenSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
});
exports.RevokeFCMTokenSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
});
// ─── GDPR ────────────────────────────────────────────────────────────────────
exports.DeleteAccountSchema = zod_1.z.object({
    confirmation: zod_1.z.literal("DELETE MY ACCOUNT"),
});
//# sourceMappingURL=schemas.js.map