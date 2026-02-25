/** Firestore collection name constants. Single source of truth for all collection paths. */

export const Collections = {
  USERS: "users",
  WORKSPACES: "workspaces",
  ORGANIZATIONS: "organizations",
  ORGANIZATION_MEMBERS: "organizationMembers",
  SUBSCRIPTIONS: "subscriptions",
  CONTENT_UPLOADS: "contentUploads",
  GENERATED_OUTPUTS: "generatedOutputs",
  BRAND_VOICE_PROFILES: "brandVoiceProfiles",
  PLATFORM_CONNECTIONS: "platformConnections",
  SCHEDULED_EVENTS: "scheduledEvents",
  ANALYTICS_SNAPSHOTS: "analyticsSnapshots",
  MULTIPLIER_SCORES: "multiplierScores",
  AUTOPILOT_CONFIGS: "autopilotConfigs",
  AUDIT_LOGS: "auditLogs",
  NOTIFICATIONS: "notifications",
  INVITES: "invites",
  WAITLIST_EMAILS: "waitlistEmails",
} as const;

export type CollectionName = (typeof Collections)[keyof typeof Collections];
