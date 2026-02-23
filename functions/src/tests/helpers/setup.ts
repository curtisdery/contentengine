/**
 * Global test setup — mock Firebase Admin, Anthropic, Stripe, and Cloud Tasks.
 */

import { vi } from "vitest";

// ─── Mock firebase-admin/firestore ───────────────────────────────────────────
const mockBatch = {
  set: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  commit: vi.fn().mockResolvedValue(undefined),
};

const mockDocRef = {
  id: "mock-doc-id",
  get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}), id: "mock-doc-id", ref: {} }),
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
};

const mockCollectionRef = {
  doc: vi.fn().mockReturnValue(mockDocRef),
  add: vi.fn().mockResolvedValue(mockDocRef),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  startAfter: vi.fn().mockReturnThis(),
  count: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }) }),
  get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
};

const mockDb = {
  collection: vi.fn().mockReturnValue(mockCollectionRef),
  batch: vi.fn().mockReturnValue(mockBatch),
  runTransaction: vi.fn().mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(mockBatch)),
};

const mockAuth = {
  verifyIdToken: vi.fn().mockResolvedValue({ uid: "test-uid", email: "test@example.com" }),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
  listUsers: vi.fn().mockResolvedValue({ users: [] }),
};

const mockStorage = {
  bucket: vi.fn().mockReturnValue({
    file: vi.fn().mockReturnValue({
      getSignedUrl: vi.fn().mockResolvedValue(["https://storage.example.com/signed-url"]),
    }),
  }),
};

const mockMessaging = {
  sendEachForMulticast: vi.fn().mockResolvedValue({ successCount: 1, failureCount: 0, responses: [] }),
};

vi.mock("firebase-admin", () => ({
  default: {
    initializeApp: vi.fn(),
    firestore: vi.fn(() => mockDb),
    auth: vi.fn(() => mockAuth),
    storage: vi.fn(() => mockStorage),
    messaging: vi.fn(() => mockMessaging),
  },
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: vi.fn().mockReturnValue({ _methodName: "serverTimestamp" }),
    arrayUnion: vi.fn((...args: unknown[]) => ({ _methodName: "arrayUnion", args })),
    arrayRemove: vi.fn((...args: unknown[]) => ({ _methodName: "arrayRemove", args })),
    increment: vi.fn((n: number) => ({ _methodName: "increment", operand: n })),
    delete: vi.fn().mockReturnValue({ _methodName: "delete" }),
  },
  Timestamp: {
    now: vi.fn().mockReturnValue({ toDate: () => new Date(), seconds: 1000000, nanoseconds: 0 }),
    fromDate: vi.fn((d: Date) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 })),
  },
}));

// ─── Mock firebase-functions ─────────────────────────────────────────────────
vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_optsOrFn: unknown, maybeFn?: unknown) => {
    return typeof maybeFn === "function" ? maybeFn : _optsOrFn;
  }),
  onRequest: vi.fn((_optsOrFn: unknown, maybeFn?: unknown) => {
    return typeof maybeFn === "function" ? maybeFn : _optsOrFn;
  }),
  HttpsError: class HttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: vi.fn((_opts: unknown, fn?: unknown) => typeof fn === "function" ? fn : _opts),
}));

vi.mock("firebase-functions/v2/firestore", () => ({
  onDocumentCreated: vi.fn((_path: unknown, fn?: unknown) => typeof fn === "function" ? fn : _path),
}));

vi.mock("firebase-functions/params", () => ({
  defineSecret: vi.fn((name: string) => ({ value: () => `mock-${name}`, name })),
  defineString: vi.fn((name: string, opts?: { default?: string }) => ({ value: () => opts?.default ?? "", name })),
}));

// ─── Export mocks for test access ────────────────────────────────────────────
export {
  mockDb,
  mockAuth,
  mockStorage,
  mockMessaging,
  mockCollectionRef,
  mockDocRef,
  mockBatch,
};

// ─── Mock the config modules ─────────────────────────────────────────────────
vi.mock("../../config/firebase.js", () => ({
  db: mockDb,
  auth: mockAuth,
  storage: mockStorage,
  messaging: mockMessaging,
  admin: { initializeApp: vi.fn() },
}));

vi.mock("../../config/env.js", () => ({
  STRIPE_SECRET_KEY: { value: () => "sk_test_mock" },
  STRIPE_WEBHOOK_SECRET: { value: () => "whsec_mock" },
  ANTHROPIC_API_KEY: { value: () => "sk-ant-mock" },
  TOKEN_ENCRYPTION_KEY: { value: () => "a".repeat(64) },
  GCP_PROJECT: { value: () => "test-project" },
  GCP_LOCATION: { value: () => "us-central1" },
  FRONTEND_URL: { value: () => "http://localhost:3000" },
  STRIPE_PRICE_GROWTH: { value: () => "price_growth_mock" },
  STRIPE_PRICE_PRO: { value: () => "price_pro_mock" },
  TWITTER_CLIENT_ID: { value: () => "twitter-client-id" },
  LINKEDIN_CLIENT_ID: { value: () => "linkedin-client-id" },
  LINKEDIN_CLIENT_SECRET: { value: () => "linkedin-client-secret" },
}));

vi.mock("../../config/stripe.js", () => ({
  getStripe: vi.fn(() => ({
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test" }) } },
    billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/test" }) } },
    webhooks: { constructEvent: vi.fn() },
  })),
}));

vi.mock("../../config/anthropic.js", () => ({
  getAnthropic: vi.fn(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ core_idea: "test", key_points: [], best_hooks: [], quotable_moments: [], emotional_arc: [], content_type_classification: "article", suggested_platforms: [] }) }],
      }),
    },
  })),
}));
