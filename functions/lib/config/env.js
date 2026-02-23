"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LINKEDIN_CLIENT_SECRET = exports.LINKEDIN_CLIENT_ID = exports.TWITTER_CLIENT_ID = exports.STRIPE_PRICE_PRO = exports.STRIPE_PRICE_GROWTH = exports.FRONTEND_URL = exports.GCP_LOCATION = exports.GCP_PROJECT = exports.TOKEN_ENCRYPTION_KEY = exports.ANTHROPIC_API_KEY = exports.STRIPE_WEBHOOK_SECRET = exports.STRIPE_SECRET_KEY = void 0;
const params_1 = require("firebase-functions/params");
// Secrets (stored in Secret Manager)
exports.STRIPE_SECRET_KEY = (0, params_1.defineSecret)("STRIPE_SECRET_KEY");
exports.STRIPE_WEBHOOK_SECRET = (0, params_1.defineSecret)("STRIPE_WEBHOOK_SECRET");
exports.ANTHROPIC_API_KEY = (0, params_1.defineSecret)("ANTHROPIC_API_KEY");
exports.TOKEN_ENCRYPTION_KEY = (0, params_1.defineSecret)("TOKEN_ENCRYPTION_KEY");
// Config strings
exports.GCP_PROJECT = (0, params_1.defineString)("GCLOUD_PROJECT", { default: "" });
exports.GCP_LOCATION = (0, params_1.defineString)("GCP_LOCATION", { default: "us-central1" });
exports.FRONTEND_URL = (0, params_1.defineString)("FRONTEND_URL", { default: "https://pandocast.com" });
// Stripe price IDs
exports.STRIPE_PRICE_GROWTH = (0, params_1.defineString)("STRIPE_PRICE_GROWTH", { default: "" });
exports.STRIPE_PRICE_PRO = (0, params_1.defineString)("STRIPE_PRICE_PRO", { default: "" });
// OAuth client IDs (non-secret, stored as config)
exports.TWITTER_CLIENT_ID = (0, params_1.defineString)("TWITTER_CLIENT_ID", { default: "" });
exports.LINKEDIN_CLIENT_ID = (0, params_1.defineString)("LINKEDIN_CLIENT_ID", { default: "" });
exports.LINKEDIN_CLIENT_SECRET = (0, params_1.defineSecret)("LINKEDIN_CLIENT_SECRET");
//# sourceMappingURL=env.js.map