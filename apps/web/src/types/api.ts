export interface ApiError {
  detail: string;
  status_code: number;
}

export interface DashboardStats {
  content_uploads: number;
  outputs_generated: number;
  platforms_connected: number;
  multiplier_score: number | null;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

// Content Types
export interface ContentUploadRequest {
  title: string;
  content_type: 'blog' | 'video_transcript' | 'podcast_transcript';
  raw_content?: string;
  storage_path?: string;
  source_url?: string;
}

export interface UploadURLResponse {
  upload_url: string;
  storage_path: string;
}

export interface ContentDNA {
  core_idea: string;
  key_points: Array<{ point: string; strength: number; description: string }>;
  best_hooks: Array<{ hook: string; hook_type: string; platform_fit: string[] }>;
  quotable_moments: string[];
  emotional_arc: Array<{ segment: string; tone: string; intensity: number }>;
  content_type_classification: string;
  suggested_platforms: Array<{ platform_id: string; platform_name: string; fit_score: number; reason: string }>;
}

export interface ContentUploadResponse {
  id: string;
  title: string;
  content_type: string;
  status: string;
  content_dna: ContentDNA | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentListResponse {
  items: ContentUploadResponse[];
  total: number;
}

export interface ContentUpdateRequest {
  emphasis_notes?: string;
  focus_hook_index?: number;
  additional_context?: string;
}

// Voice Types
export interface VoiceProfileCreateRequest {
  profile_name: string;
  voice_attributes: string[];
  sample_content: string[];
  banned_terms: string[];
  preferred_terms: string[];
  audience_label: string;
  signature_phrases: string[];
  emoji_policy: Record<string, unknown>;
  cta_library: string[];
  approved_topics: string[];
  restricted_topics: string[];
  is_default: boolean;
}

export interface VoiceProfileResponse {
  id: string;
  workspace_id: string;
  profile_name: string;
  voice_attributes: string[];
  sample_content: string[];
  tone_metrics: Record<string, number>;
  vocabulary: Record<string, unknown>;
  formatting_config: Record<string, unknown>;
  cta_library: string[];
  topic_boundaries: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface VoiceSampleAnalysis {
  tone_metrics: Record<string, number>;
  vocabulary_patterns: Record<string, unknown>;
  signature_phrases: string[];
  suggested_attributes: string[];
}

// Generation Types
export interface GenerateRequest {
  voice_profile_id?: string;
  selected_platforms?: string[];
  emphasis_notes?: string;
}

export interface GeneratedOutputResponse {
  id: string;
  content_upload_id: string;
  platform_id: string;
  format_name: string;
  content: string;
  metadata: Record<string, unknown> | null;
  voice_match_score: number | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedOutputListResponse {
  items: GeneratedOutputResponse[];
  total: number;
  content_title: string;
  content_id: string;
}

export interface OutputUpdateRequest {
  content?: string;
  status?: string;
}

export interface BulkApproveRequest {
  output_ids: string[];
}

export interface PlatformProfileResponse {
  platform_id: string;
  name: string;
  tier: number;
  native_tone: string;
  media_format: string;
  posting_cadence: string;
  length_range: { min: number; ideal: number; max: number };
}

// Calendar Types
export interface ScheduleOutputRequest {
  output_id: string;
  scheduled_at: string; // ISO 8601
}

export interface ScheduleBatchRequest {
  items: ScheduleOutputRequest[];
}

export interface AutoScheduleRequest {
  content_id: string;
  start_date: string; // ISO 8601
}

export interface RescheduleRequest {
  scheduled_at: string;
}

export interface ScheduledEventResponse {
  id: string;
  workspace_id: string;
  generated_output_id: string;
  platform_id: string;
  scheduled_at: string;
  published_at: string | null;
  status: string; // scheduled/publishing/published/failed/cancelled
  publish_error: string | null;
  retry_count: number;
  priority: number;
  created_at: string;
  updated_at: string;
  output_content: string | null;
  output_format_name: string | null;
  content_title: string | null;
}

export interface CalendarEventsResponse {
  events: ScheduledEventResponse[];
  total: number;
}

export interface ContentGapResponse {
  platform_id: string;
  platform_name: string;
  last_scheduled_at: string | null;
  days_since_last: number;
  recommended_cadence_days: number;
  gap_severity: 'none' | 'mild' | 'moderate' | 'severe';
  suggestion: string;
}

export interface CalendarStatsResponse {
  total_scheduled: number;
  total_published: number;
  total_failed: number;
  upcoming_today: number;
  upcoming_this_week: number;
  platforms_active: number;
  content_gaps: ContentGapResponse[];
}

export interface PlatformConnectionResponse {
  id: string;
  workspace_id: string;
  platform_id: string;
  platform_username: string;
  is_active: boolean;
  created_at: string;
}

export interface OAuthAuthorizeResponse {
  authorize_url: string;
}

// Analytics Types
export interface MultiplierScoreResponse {
  id: string;
  content_upload_id: string;
  multiplier_value: number;
  original_reach: number;
  total_reach: number;
  total_engagements: number;
  platforms_published: number;
  platform_breakdown: Array<{
    platform_id: string;
    platform_name: string;
    reach: number;
    engagements: number;
    engagement_rate: number;
  }>;
  best_platform_id: string | null;
  best_platform_reach: number;
  calculated_at: string;
}

export interface PlatformPerformanceResponse {
  platform_id: string;
  platform_name: string;
  total_impressions: number;
  total_engagements: number;
  avg_engagement_rate: number;
  total_saves: number;
  total_shares: number;
  total_clicks: number;
  total_follows: number;
  post_count: number;
  trend: 'improving' | 'stable' | 'declining';
}

export interface ContentTypePerformanceResponse {
  content_type: string;
  avg_engagement_rate: number;
  total_reach: number;
  post_count: number;
  avg_multiplier_score: number;
}

export interface HookPerformanceResponse {
  hook_type: string;
  avg_engagement_rate: number;
  total_reach: number;
  usage_count: number;
  best_platform_for_hook: string | null;
}

export interface TimeHeatmapEntry {
  day_of_week: number;
  hour: number;
  avg_engagement_rate: number;
  post_count: number;
}

export interface AudienceIntelligenceResponse {
  fastest_growing_platform: {
    platform_id: string;
    name: string;
    growth_rate: number;
    follows_gained: number;
  } | null;
  best_engagement_platform: {
    platform_id: string;
    name: string;
    avg_engagement_rate: number;
  } | null;
  platform_rankings: Array<{
    platform_id: string;
    name: string;
    score: number;
    follows_gained: number;
    engagement_rate: number;
  }>;
  recommendations: string[];
}

export interface ContentStrategySuggestion {
  type: 'topic' | 'format' | 'timing' | 'platform';
  suggestion: string;
  confidence: number;
  data_points: number;
}

export interface AnalyticsDashboardResponse {
  total_content_pieces: number;
  total_outputs_generated: number;
  total_published: number;
  total_reach: number;
  total_engagements: number;
  avg_multiplier_score: number;
  best_multiplier_score: number;
  platforms_active: number;
  top_performing_content: Array<{
    content_id: string;
    title: string;
    multiplier_value: number;
    total_reach: number;
  }>;
  recent_performance: Array<{
    date: string;
    impressions: number;
    engagements: number;
  }>;
}

// Autopilot Types
export interface AutopilotConfigResponse {
  id: string;
  workspace_id: string;
  platform_id: string;
  enabled: boolean;
  total_outputs_reviewed: number;
  approved_without_edit: number;
  approval_rate: number;
  required_approval_rate: number;
  required_minimum_reviews: number;
  enabled_at: string | null;
  auto_publish_count: number;
}

export interface AutopilotEligibilityResponse {
  eligible: boolean;
  current_approval_rate: number;
  required_approval_rate: number;
  reviews_completed: number;
  reviews_required: number;
  message: string;
}

export interface AutopilotSummaryResponse {
  total_platforms: number;
  autopilot_enabled: number;
  eligible_not_enabled: number;
  not_eligible: number;
  total_auto_published: number;
  platforms: Array<{
    platform_id: string;
    platform_name: string;
    enabled: boolean;
    eligible: boolean;
    approval_rate: number;
    auto_publish_count: number;
    status: 'active' | 'eligible' | 'building_trust' | 'not_started';
  }>;
}

export interface ABTestResponse {
  id: string;
  workspace_id: string;
  content_upload_id: string;
  platform_id: string;
  variant_a_output_id: string;
  variant_b_output_id: string;
  status: string;
  winner_output_id: string | null;
  variant_a_metrics: Record<string, number> | null;
  variant_b_metrics: Record<string, number> | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface SessionResponse {
  id: string;
  device_fingerprint: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: string;
  is_active: boolean;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
