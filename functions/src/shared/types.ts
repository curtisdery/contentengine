import { Timestamp } from "firebase-admin/firestore";

/** Base fields present on all Firestore documents. */
export interface BaseDoc {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserDoc extends BaseDoc {
  firebaseUid: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  isActive: boolean;
  defaultWorkspaceId: string;
  fcmTokens: string[];
  mfaEnabled: boolean;
}

export interface WorkspaceDoc extends BaseDoc {
  organizationId: string;
  name: string;
  slug: string;
}

export interface OrganizationDoc extends BaseDoc {
  name: string;
  ownerUid: string;
  slug: string;
}

export interface OrganizationMemberDoc extends BaseDoc {
  organizationId: string;
  userId: string;
  role: "owner" | "admin" | "editor" | "viewer";
}

export interface SubscriptionDoc extends BaseDoc {
  organizationId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  tier: "starter" | "growth" | "pro";
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Timestamp | null;
  currentPeriodEnd: Timestamp | null;
}

export interface ContentDNA {
  coreIdea: string;
  keyPoints: Array<{ point: string; strength: number; description: string }>;
  bestHooks: Array<{ hook: string; hookType: string; platformFit: string[] }>;
  quotableMoments: string[];
  emotionalArc: Array<{ segment: string; tone: string; intensity: number }>;
  contentTypeClassification: string;
  suggestedPlatforms: Array<{
    platformId: string;
    platformName: string;
    fitScore: number;
    reason: string;
  }>;
  userAdjustments?: {
    emphasisNotes?: string;
    focusHookIndex?: number;
    additionalContext?: string;
  };
}

export interface ContentUploadDoc extends BaseDoc {
  workspaceId: string;
  title: string;
  contentType: "blog" | "video_transcript" | "podcast_transcript";
  rawContent: string;
  storagePath: string | null;
  sourceUrl: string | null;
  contentDna: ContentDNA | null;
  status: "pending" | "analyzing" | "analyzed" | "generating" | "completed" | "failed";
}

export interface GeneratedOutputDoc extends BaseDoc {
  workspaceId: string;
  contentUploadId: string;
  platformId: string;
  formatName: string;
  content: string;
  outputMetadata: Record<string, unknown> | null;
  voiceMatchScore: number | null;
  status: "draft" | "approved" | "rejected" | "scheduled" | "publishing" | "published" | "failed";
  scheduledAt: Timestamp | null;
  publishedAt: Timestamp | null;
  platformPostId: string | null;
}

export interface BrandVoiceProfileDoc extends BaseDoc {
  workspaceId: string;
  profileName: string;
  voiceAttributes: string[];
  sampleContent: string[];
  toneMetrics: Record<string, number>;
  vocabulary: Record<string, unknown>;
  formattingConfig: Record<string, unknown>;
  ctaLibrary: string[];
  topicBoundaries: Record<string, unknown>;
  isDefault: boolean;
}

export interface PlatformConnectionDoc extends BaseDoc {
  workspaceId: string;
  platformId: string;
  platformUserId: string | null;
  platformUsername: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Timestamp | null;
  scopes: string[];
  isActive: boolean;
  followerCount: number | null;
}

export interface ScheduledEventDoc extends BaseDoc {
  workspaceId: string;
  generatedOutputId: string;
  platformId: string;
  scheduledAt: Timestamp;
  publishedAt: Timestamp | null;
  status: "scheduled" | "publishing" | "published" | "failed" | "cancelled";
  publishError: string | null;
  retryCount: number;
  maxRetries: number;
  priority: number;
}

export interface AnalyticsSnapshotDoc extends BaseDoc {
  workspaceId: string;
  generatedOutputId: string;
  platformId: string;
  snapshotTime: Timestamp;
  impressions: number;
  engagements: number;
  saves: number;
  shares: number;
  clicks: number;
  follows: number;
  comments: number;
}

export interface MultiplierScoreDoc extends BaseDoc {
  workspaceId: string;
  contentUploadId: string;
  multiplierValue: number;
  originalReach: number;
  totalReach: number;
  totalEngagements: number;
  platformsPublished: number;
  platformBreakdown: Array<{
    platformId: string;
    platformName: string;
    reach: number;
    engagements: number;
    engagementRate: number;
  }>;
  bestPlatformId: string | null;
  bestPlatformReach: number;
}

export interface AutopilotConfigDoc extends BaseDoc {
  workspaceId: string;
  platformId: string;
  enabled: boolean;
  totalOutputsReviewed: number;
  approvedWithoutEdit: number;
  approvalRate: number;
  requiredApprovalRate: number;
  requiredMinimumReviews: number;
  enabledAt: Timestamp | null;
  autoPublishCount: number;
}

export interface AuditLogDoc {
  workspaceId: string;
  userId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Timestamp;
}

export interface NotificationDoc extends BaseDoc {
  userId: string;
  workspaceId: string;
  title: string;
  body: string;
  type: string;
  resourceType: string | null;
  resourceId: string | null;
  read: boolean;
}

export interface InviteDoc extends BaseDoc {
  organizationId: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  invitedBy: string;
  status: "pending" | "accepted" | "expired";
  token: string;
}

export interface ABTestDoc extends BaseDoc {
  workspaceId: string;
  contentUploadId: string;
  platformId: string;
  name: string;
  hypothesis: string;
  status: "running" | "completed" | "cancelled";
  variantA: ABTestVariant;
  variantB: ABTestVariant;
  winnerId: string | null;
  winnerMargin: number | null;
  insight: string | null;
  startedAt: Timestamp;
  completedAt: Timestamp | null;
  evaluationHours: number;
}

export interface ABTestVariant {
  outputId: string;
  label: string;
  hookType: string;
  impressions: number;
  engagements: number;
  engagementRate: number;
}

export interface HookPerformance {
  hookType: string;
  platformId: string;
  impressions: number;
  engagements: number;
  engagementRate: number;
  sampleSize: number;
}
