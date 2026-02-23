/**
 * Tests for Voice API — createVoiceProfile, getVoiceProfile, listVoiceProfiles,
 * updateVoiceProfile, analyzeSamples.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockCollectionRef, mockDocRef, mockBatch } from "../helpers/setup.js";

// ─── Mock analyzeVoiceSamples (AI module) ────────────────────────────────────
vi.mock("../../lib/ai/contentDNA.js", () => ({
  analyzeVoiceSamples: vi.fn().mockResolvedValue({
    tone_metrics: { formality: 0.7, humor: 0.3, vulnerability: 0.4, directness: 0.8, jargon_density: 0.2 },
    vocabulary_patterns: { common_words: ["however", "therefore"], sentence_starters: ["I believe"] },
    avg_sentence_length: 15,
    active_voice_ratio: 0.75,
    signature_phrases: ["at the end of the day"],
    suggested_attributes: ["professional", "concise", "direct"],
  }),
  analyzeContentDNA: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../lib/taskClient.js", () => ({
  enqueueTask: vi.fn().mockResolvedValue("task-name"),
  getTaskHandlerUrl: vi.fn().mockReturnValue("https://example.com/task"),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authedRequest(data: Record<string, unknown> = {}) {
  return {
    auth: {
      uid: "test-uid",
      token: {
        email: "test@example.com",
        name: "Test User",
        picture: null,
        email_verified: true,
      },
    },
    data,
  };
}

function unauthenticatedRequest(data: Record<string, unknown> = {}) {
  return { auth: null, data };
}

/**
 * Wire up Firestore mocks for verifyAuth + voice-specific collections.
 */
function setupVoiceMocks(overrides?: {
  profileExists?: boolean;
  profileData?: Record<string, unknown>;
  profileDocs?: Array<{ id: string; data: () => Record<string, unknown>; ref: unknown }>;
}) {
  const profileData = overrides?.profileData ?? {
    workspaceId: "ws-1",
    profileName: "Default Voice",
    voiceAttributes: ["professional", "friendly"],
    sampleContent: [],
    toneMetrics: {},
    vocabulary: {},
    formattingConfig: { signature_phrases: [], emoji_policy: {} },
    ctaLibrary: [],
    topicBoundaries: { approved_topics: [], restricted_topics: [] },
    isDefault: true,
  };

  const profileDocRef = {
    ...mockDocRef,
    id: "voice-profile-1",
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({
      exists: overrides?.profileExists !== false,
      id: "voice-profile-1",
      data: () => profileData,
      ref: mockDocRef,
    }),
  };

  mockDb.collection.mockImplementation((name: string) => {
    if (name === "users") {
      return {
        doc: vi.fn().mockReturnValue({
          ...mockDocRef,
          id: "user-1",
          get: vi.fn().mockResolvedValue({
            exists: true,
            id: "user-1",
            data: () => ({
              firebaseUid: "test-uid",
              email: "test@example.com",
              fullName: "Test User",
              avatarUrl: null,
              emailVerified: true,
              isActive: true,
              defaultWorkspaceId: "ws-1",
              fcmTokens: [],
              mfaEnabled: false,
            }),
            ref: mockDocRef,
          }),
        }),
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              empty: false,
              docs: [{
                id: "user-1",
                data: () => ({
                  firebaseUid: "test-uid",
                  email: "test@example.com",
                  fullName: "Test User",
                  avatarUrl: null,
                  emailVerified: true,
                  isActive: true,
                  defaultWorkspaceId: "ws-1",
                  fcmTokens: [],
                  mfaEnabled: false,
                }),
                ref: mockDocRef,
              }],
              size: 1,
            }),
          }),
          get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
        }),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
      };
    }
    if (name === "workspaces") {
      return {
        doc: vi.fn().mockReturnValue({
          ...mockDocRef,
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ organizationId: "org-1" }),
            ref: {},
          }),
        }),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
      };
    }
    if (name === "organizationMembers") {
      return {
        doc: vi.fn().mockReturnValue(mockDocRef),
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                empty: false,
                docs: [{ id: "m-1", data: () => ({ role: "owner" }), ref: {} }],
                size: 1,
              }),
            }),
          }),
        }),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
      };
    }
    if (name === "brandVoiceProfiles") {
      const listDocs = overrides?.profileDocs ?? [];
      return {
        doc: vi.fn().mockReturnValue(profileDocRef),
        add: vi.fn().mockResolvedValue(profileDocRef),
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              empty: listDocs.length === 0,
              docs: listDocs,
              size: listDocs.length,
            }),
          }),
          orderBy: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              empty: listDocs.length === 0,
              docs: listDocs,
              size: listDocs.length,
            }),
          }),
          limit: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue({
            empty: listDocs.length === 0,
            docs: listDocs,
            size: listDocs.length,
          }),
        }),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({
          empty: listDocs.length === 0,
          docs: listDocs,
          size: listDocs.length,
        }),
      };
    }
    return mockCollectionRef;
  });

  // Also mock db.batch() for the default-unsetting logic
  mockDb.batch.mockReturnValue(mockBatch);

  return { profileDocRef, profileData };
}

// ─── Import functions under test ─────────────────────────────────────────────
import {
  createVoiceProfile,
  getVoiceProfile,
  listVoiceProfiles,
  updateVoiceProfile,
  analyzeSamples,
} from "../../api/voice.js";

describe("Voice API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.collection.mockReturnValue(mockCollectionRef);
    mockDb.batch.mockReturnValue(mockBatch);
    mockCollectionRef.doc.mockReturnValue(mockDocRef);
    mockCollectionRef.where.mockReturnThis();
    mockCollectionRef.orderBy.mockReturnThis();
    mockCollectionRef.limit.mockReturnThis();
    mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
    mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({}), id: "mock-doc-id", ref: mockDocRef });
    mockDocRef.set.mockResolvedValue(undefined);
    mockDocRef.update.mockResolvedValue(undefined);
    mockBatch.set.mockReturnThis();
    mockBatch.update.mockReturnThis();
    mockBatch.commit.mockResolvedValue(undefined);
  });

  // ─── createVoiceProfile ──────────────────────────────────────────────────

  describe("createVoiceProfile", () => {
    it("should create a voice profile document and return it", async () => {
      const { profileDocRef } = setupVoiceMocks();

      const result = await (createVoiceProfile as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({
          profile_name: "My Brand Voice",
          voice_attributes: ["confident", "warm"],
          sample_content: [],
          is_default: false,
        })
      );

      expect(result).toBeDefined();
      expect(result.id).toBe("voice-profile-1");
      expect(profileDocRef.set).toHaveBeenCalled();
    });

    it("should store the correct fields in the document", async () => {
      const { profileDocRef } = setupVoiceMocks();

      await (createVoiceProfile as unknown as (req: unknown) => Promise<unknown>)(
        authedRequest({
          profile_name: "Brand Voice A",
          voice_attributes: ["witty"],
          sample_content: [],
          banned_terms: ["synergy"],
          preferred_terms: ["innovative"],
          audience_label: "tech professionals",
          is_default: false,
        })
      );

      const setData = profileDocRef.set.mock.calls[0][0];
      expect(setData.profileName).toBe("Brand Voice A");
      expect(setData.voiceAttributes).toEqual(["witty"]);
      expect(setData.workspaceId).toBe("ws-1");
      expect(setData.vocabulary.banned_terms).toEqual(["synergy"]);
      expect(setData.vocabulary.preferred_terms).toEqual(["innovative"]);
      expect(setData.vocabulary.audience_label).toBe("tech professionals");
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (createVoiceProfile as unknown as (req: unknown) => Promise<unknown>)(
          unauthenticatedRequest({ profile_name: "X" })
        )
      ).rejects.toThrow();
    });

    it("should un-default existing profiles when is_default is true", async () => {
      const existingDefault = {
        id: "old-default",
        data: () => ({ workspaceId: "ws-1", isDefault: true, profileName: "Old" }),
        ref: { update: vi.fn() },
      };
      setupVoiceMocks({ profileDocs: [existingDefault] });

      await (createVoiceProfile as unknown as (req: unknown) => Promise<unknown>)(
        authedRequest({
          profile_name: "New Default",
          voice_attributes: [],
          sample_content: [],
          is_default: true,
        })
      );

      // The batch should have been used to un-default the old profile
      expect(mockBatch.update).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalled();
    });
  });

  // ─── getVoiceProfile ─────────────────────────────────────────────────────

  describe("getVoiceProfile", () => {
    it("should return the voice profile by ID", async () => {
      setupVoiceMocks();

      const result = await (getVoiceProfile as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({ profile_id: "voice-profile-1" })
      );

      expect(result).toBeDefined();
      expect(result.id).toBe("voice-profile-1");
    });

    it("should throw when profile does not exist", async () => {
      setupVoiceMocks({ profileExists: false });

      await expect(
        (getVoiceProfile as unknown as (req: unknown) => Promise<unknown>)(
          authedRequest({ profile_id: "nonexistent" })
        )
      ).rejects.toThrow();
    });

    it("should throw when profile_id is not provided", async () => {
      setupVoiceMocks();

      await expect(
        (getVoiceProfile as unknown as (req: unknown) => Promise<unknown>)(authedRequest({}))
      ).rejects.toThrow();
    });

    it("should throw when profile belongs to different workspace", async () => {
      setupVoiceMocks({
        profileData: {
          workspaceId: "other-workspace",
          profileName: "Other",
          voiceAttributes: [],
          sampleContent: [],
          toneMetrics: {},
          vocabulary: {},
          formattingConfig: {},
          ctaLibrary: [],
          topicBoundaries: {},
          isDefault: false,
        },
      });

      await expect(
        (getVoiceProfile as unknown as (req: unknown) => Promise<unknown>)(
          authedRequest({ profile_id: "voice-profile-1" })
        )
      ).rejects.toThrow();
    });
  });

  // ─── listVoiceProfiles ───────────────────────────────────────────────────

  describe("listVoiceProfiles", () => {
    it("should return workspace voice profiles", async () => {
      const profileDocs = [
        {
          id: "vp-1",
          data: () => ({ workspaceId: "ws-1", profileName: "Voice A", isDefault: true }),
          ref: {},
        },
        {
          id: "vp-2",
          data: () => ({ workspaceId: "ws-1", profileName: "Voice B", isDefault: false }),
          ref: {},
        },
      ];
      setupVoiceMocks({ profileDocs });

      const result = await (listVoiceProfiles as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest()
      );

      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
      const items = result.items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("should return empty list when no profiles exist", async () => {
      setupVoiceMocks({ profileDocs: [] });

      const result = await (listVoiceProfiles as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest()
      );

      expect(result).toBeDefined();
      expect((result.items as unknown[]).length).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  // ─── updateVoiceProfile ──────────────────────────────────────────────────

  describe("updateVoiceProfile", () => {
    it("should update voice profile fields", async () => {
      const { profileDocRef } = setupVoiceMocks();

      const result = await (updateVoiceProfile as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({
          profile_id: "voice-profile-1",
          profile_name: "Updated Voice",
          voice_attributes: ["bold", "energetic"],
        })
      );

      expect(result).toBeDefined();
      expect(profileDocRef.update).toHaveBeenCalled();
      const updateArgs = profileDocRef.update.mock.calls[0][0];
      expect(updateArgs.profileName).toBe("Updated Voice");
      expect(updateArgs.voiceAttributes).toEqual(["bold", "energetic"]);
    });

    it("should throw when profile does not exist", async () => {
      setupVoiceMocks({ profileExists: false });

      await expect(
        (updateVoiceProfile as unknown as (req: unknown) => Promise<unknown>)(
          authedRequest({ profile_id: "nonexistent", profile_name: "X" })
        )
      ).rejects.toThrow();
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (updateVoiceProfile as unknown as (req: unknown) => Promise<unknown>)(
          unauthenticatedRequest({ profile_id: "vp-1", profile_name: "X" })
        )
      ).rejects.toThrow();
    });
  });

  // ─── analyzeSamples ──────────────────────────────────────────────────────

  describe("analyzeSamples", () => {
    it("should analyze writing samples and return voice characteristics", async () => {
      setupVoiceMocks();

      const longSample = "A".repeat(60); // min 50 chars per sample
      const result = await (analyzeSamples as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({ samples: [longSample] })
      );

      expect(result).toBeDefined();
      expect(result.tone_metrics).toBeDefined();
      expect(result.vocabulary_patterns).toBeDefined();
      expect(result.signature_phrases).toBeDefined();
      expect(result.suggested_attributes).toBeDefined();
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (analyzeSamples as unknown as (req: unknown) => Promise<unknown>)(
          unauthenticatedRequest({ samples: ["A".repeat(60)] })
        )
      ).rejects.toThrow();
    });

    it("should throw for empty samples array", async () => {
      setupVoiceMocks();

      await expect(
        (analyzeSamples as unknown as (req: unknown) => Promise<unknown>)(
          authedRequest({ samples: [] })
        )
      ).rejects.toThrow();
    });
  });
});
