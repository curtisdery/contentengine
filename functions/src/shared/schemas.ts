/** Zod schemas matching frontend api.ts types — used for request validation. */

import { z } from "zod";

// ─── Content ─────────────────────────────────────────────────────────────────

export const ContentUploadRequestSchema = z.object({
  title: z.string().min(1).max(500),
  content_type: z.enum(["blog", "video_transcript", "podcast_transcript"]),
  raw_content: z.string().optional(),
  storage_path: z.string().optional(),
  source_url: z.string().url().optional(),
});

export const ContentUpdateRequestSchema = z.object({
  emphasis_notes: z.string().max(2000).optional(),
  focus_hook_index: z.number().int().min(0).optional(),
  additional_context: z.string().max(5000).optional(),
});

// ─── Voice ───────────────────────────────────────────────────────────────────

export const VoiceProfileCreateSchema = z.object({
  profile_name: z.string().min(1).max(200),
  voice_attributes: z.array(z.string()).default([]),
  sample_content: z.array(z.string()).default([]),
  banned_terms: z.array(z.string()).default([]),
  preferred_terms: z.array(z.string()).default([]),
  audience_label: z.string().default(""),
  signature_phrases: z.array(z.string()).default([]),
  emoji_policy: z.record(z.unknown()).default({}),
  cta_library: z.array(z.string()).default([]),
  approved_topics: z.array(z.string()).default([]),
  restricted_topics: z.array(z.string()).default([]),
  is_default: z.boolean().default(false),
});

export const VoiceProfileUpdateSchema = VoiceProfileCreateSchema.partial();

export const AnalyzeSamplesSchema = z.object({
  samples: z.array(z.string().min(50)).min(1).max(5),
});

// ─── Generation ──────────────────────────────────────────────────────────────

export const GenerateRequestSchema = z.object({
  voice_profile_id: z.string().optional(),
  selected_platforms: z.array(z.string()).optional(),
  emphasis_notes: z.string().max(2000).optional(),
});

// ─── Output ──────────────────────────────────────────────────────────────────

export const OutputUpdateSchema = z.object({
  content: z.string().optional(),
  status: z.enum(["draft", "approved", "rejected"]).optional(),
});

export const BulkApproveSchema = z.object({
  output_ids: z.array(z.string()).min(1).max(100),
});

// ─── Calendar ────────────────────────────────────────────────────────────────

export const ScheduleOutputSchema = z.object({
  output_id: z.string(),
  scheduled_at: z.string().datetime(),
});

export const ScheduleBatchSchema = z.object({
  items: z.array(
    z.object({
      output_id: z.string(),
      scheduled_at: z.string().datetime(),
    })
  ).min(1).max(100),
});

export const AutoScheduleSchema = z.object({
  content_id: z.string(),
  start_date: z.string().datetime(),
});

export const RescheduleSchema = z.object({
  scheduled_at: z.string().datetime(),
});

export const CalendarQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  platform_id: z.string().optional(),
});

// ─── Connections ─────────────────────────────────────────────────────────────

export const GetOAuthURLSchema = z.object({
  platform_id: z.string(),
});

export const DisconnectPlatformSchema = z.object({
  connection_id: z.string(),
});

// ─── Analytics ───────────────────────────────────────────────────────────────

export const AnalyticsQuerySchema = z.object({
  days: z.number().int().min(1).max(365).default(30),
  platform_id: z.string().optional(),
});

export const ContentAnalyticsSchema = z.object({
  content_id: z.string(),
});

// ─── Team ────────────────────────────────────────────────────────────────────

export const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "editor", "viewer"]),
});

export const AcceptInviteSchema = z.object({
  token: z.string(),
});

export const UpdateRoleSchema = z.object({
  member_id: z.string(),
  role: z.enum(["admin", "editor", "viewer"]),
});

export const RemoveMemberSchema = z.object({
  member_id: z.string(),
});

export const TransferOwnershipSchema = z.object({
  new_owner_id: z.string(),
});

// ─── Autopilot ───────────────────────────────────────────────────────────────

export const AutopilotToggleSchema = z.object({
  platform_id: z.string(),
  enabled: z.boolean(),
});

export const AutopilotEligibilitySchema = z.object({
  platform_id: z.string(),
});

// ─── Billing ─────────────────────────────────────────────────────────────────

export const CreateCheckoutSchema = z.object({
  tier: z.enum(["growth", "pro"]),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});

// ─── Auth ────────────────────────────────────────────────────────────────────

export const UpdateProfileSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  avatar_url: z.string().url().optional(),
});

export const RegisterFCMTokenSchema = z.object({
  token: z.string().min(1),
});

export const RevokeFCMTokenSchema = z.object({
  token: z.string().min(1),
});

// ─── GDPR ────────────────────────────────────────────────────────────────────

export const DeleteAccountSchema = z.object({
  confirmation: z.literal("DELETE MY ACCOUNT"),
});
