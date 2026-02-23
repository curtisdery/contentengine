import { defineSecret, defineString } from "firebase-functions/params";

// Secrets (stored in Secret Manager)
export const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
export const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
export const TOKEN_ENCRYPTION_KEY = defineSecret("TOKEN_ENCRYPTION_KEY");

// Config strings (GCLOUD_PROJECT is auto-set by Firebase runtime)
export const GCP_PROJECT = { value: () => process.env.GCLOUD_PROJECT || "" };
export const GCP_LOCATION = defineString("GCP_LOCATION", { default: "us-central1" });
export const FRONTEND_URL = defineString("FRONTEND_URL", { default: "https://pandocast.com" });

// Stripe price IDs
export const STRIPE_PRICE_GROWTH = defineString("STRIPE_PRICE_GROWTH", { default: "" });
export const STRIPE_PRICE_PRO = defineString("STRIPE_PRICE_PRO", { default: "" });

// OAuth client IDs (non-secret, stored as config)
export const TWITTER_CLIENT_ID = defineString("TWITTER_CLIENT_ID", { default: "" });
export const LINKEDIN_CLIENT_ID = defineString("LINKEDIN_CLIENT_ID", { default: "" });
export const LINKEDIN_CLIENT_SECRET = defineSecret("LINKEDIN_CLIENT_SECRET");
