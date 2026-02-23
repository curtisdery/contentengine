import { describe, it, expect } from "vitest";
import "../helpers/setup.js";
import { Collections } from "../../shared/collections.js";

describe("Collections", () => {
  it("has exactly 16 collection entries", () => {
    const keys = Object.keys(Collections);
    expect(keys).toHaveLength(16);
  });

  it("USERS maps to 'users'", () => {
    expect(Collections.USERS).toBe("users");
  });

  it("WORKSPACES maps to 'workspaces'", () => {
    expect(Collections.WORKSPACES).toBe("workspaces");
  });

  it("ORGANIZATIONS maps to 'organizations'", () => {
    expect(Collections.ORGANIZATIONS).toBe("organizations");
  });

  it("ORGANIZATION_MEMBERS maps to 'organizationMembers'", () => {
    expect(Collections.ORGANIZATION_MEMBERS).toBe("organizationMembers");
  });

  it("SUBSCRIPTIONS maps to 'subscriptions'", () => {
    expect(Collections.SUBSCRIPTIONS).toBe("subscriptions");
  });

  it("CONTENT_UPLOADS maps to 'contentUploads'", () => {
    expect(Collections.CONTENT_UPLOADS).toBe("contentUploads");
  });

  it("GENERATED_OUTPUTS maps to 'generatedOutputs'", () => {
    expect(Collections.GENERATED_OUTPUTS).toBe("generatedOutputs");
  });

  it("BRAND_VOICE_PROFILES maps to 'brandVoiceProfiles'", () => {
    expect(Collections.BRAND_VOICE_PROFILES).toBe("brandVoiceProfiles");
  });

  it("PLATFORM_CONNECTIONS maps to 'platformConnections'", () => {
    expect(Collections.PLATFORM_CONNECTIONS).toBe("platformConnections");
  });

  it("SCHEDULED_EVENTS maps to 'scheduledEvents'", () => {
    expect(Collections.SCHEDULED_EVENTS).toBe("scheduledEvents");
  });

  it("ANALYTICS_SNAPSHOTS maps to 'analyticsSnapshots'", () => {
    expect(Collections.ANALYTICS_SNAPSHOTS).toBe("analyticsSnapshots");
  });

  it("MULTIPLIER_SCORES maps to 'multiplierScores'", () => {
    expect(Collections.MULTIPLIER_SCORES).toBe("multiplierScores");
  });

  it("AUTOPILOT_CONFIGS maps to 'autopilotConfigs'", () => {
    expect(Collections.AUTOPILOT_CONFIGS).toBe("autopilotConfigs");
  });

  it("AUDIT_LOGS maps to 'auditLogs'", () => {
    expect(Collections.AUDIT_LOGS).toBe("auditLogs");
  });

  it("NOTIFICATIONS maps to 'notifications'", () => {
    expect(Collections.NOTIFICATIONS).toBe("notifications");
  });

  it("INVITES maps to 'invites'", () => {
    expect(Collections.INVITES).toBe("invites");
  });

  it("contains all expected collection names as values", () => {
    const values = Object.values(Collections);
    const expected = [
      "users",
      "workspaces",
      "organizations",
      "organizationMembers",
      "subscriptions",
      "contentUploads",
      "generatedOutputs",
      "brandVoiceProfiles",
      "platformConnections",
      "scheduledEvents",
      "analyticsSnapshots",
      "multiplierScores",
      "autopilotConfigs",
      "auditLogs",
      "notifications",
      "invites",
    ];
    expect(values.sort()).toEqual(expected.sort());
  });
});
