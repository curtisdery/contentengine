"use strict";
/**
 * Connections API — 5 functions: getOAuthURL, handleOAuthCallback (onRequest), listConnections, disconnectPlatform, refreshConnection.
 * Port of apps/api/app/services/oauth.py.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshConnection = exports.disconnectPlatform = exports.listConnections = exports.handleOAuthCallback = exports.getOAuthURL = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = require("crypto");
const firebase_js_1 = require("../config/firebase.js");
const env_js_1 = require("../config/env.js");
const auth_js_1 = require("../middleware/auth.js");
const rbac_js_1 = require("../middleware/rbac.js");
const validate_js_1 = require("../middleware/validate.js");
const collections_js_1 = require("../shared/collections.js");
const schemas_js_1 = require("../shared/schemas.js");
const errors_js_1 = require("../shared/errors.js");
const encryption_js_1 = require("../lib/encryption.js");
const oauthConfigs_js_1 = require("../lib/platforms/oauthConfigs.js");
const registry_js_1 = require("../lib/platforms/publishers/registry.js");
// ─── getOAuthURL ─────────────────────────────────────────────────────────────
exports.getOAuthURL = (0, https_1.onCall)({ secrets: [env_js_1.TOKEN_ENCRYPTION_KEY] }, async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const input = (0, validate_js_1.validate)(schemas_js_1.GetOAuthURLSchema, request.data);
        const config = (0, oauthConfigs_js_1.getOAuthConfig)(input.platform_id);
        if (!config || config.authMethod !== oauthConfigs_js_1.AuthMethod.OAUTH2) {
            throw new errors_js_1.ValidationError("OAuth not supported", `Platform '${input.platform_id}' does not support OAuth.`);
        }
        const clientId = process.env[config.clientIdEnv] || "";
        if (!clientId) {
            throw new errors_js_1.ValidationError("Platform not configured", `OAuth credentials for '${input.platform_id}' are not configured.`);
        }
        // State token
        const state = (0, crypto_1.randomBytes)(32).toString("base64url");
        // PKCE
        let codeVerifier = null;
        let codeChallenge = null;
        if (config.usesPkce) {
            codeVerifier = (0, crypto_1.randomBytes)(96).toString("base64url");
            const digest = (0, crypto_1.createHash)("sha256").update(codeVerifier).digest();
            codeChallenge = digest.toString("base64url");
        }
        // Store state in Firestore (TTL 10 minutes — cleaned up by cleanup cron)
        await firebase_js_1.db.collection("oauthStates").doc(state).set({
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
            platformId: input.platform_id,
            codeVerifier,
            expiresAt: firestore_1.Timestamp.fromDate(new Date(Date.now() + 600000)),
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        // Build authorize URL
        const redirectUri = `${env_js_1.FRONTEND_URL.value()}/api/oauth/callback/${input.platform_id}`;
        const clientIdParam = input.platform_id === "tiktok" ? "client_key" : "client_id";
        const params = new URLSearchParams({
            [clientIdParam]: clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: config.scopes.join(" "),
            state,
            ...config.extraAuthorizeParams,
        });
        if (codeChallenge) {
            params.set("code_challenge", codeChallenge);
            params.set("code_challenge_method", "S256");
        }
        return { authorize_url: `${config.authorizeUrl}?${params.toString()}` };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── handleOAuthCallback (onRequest) ─────────────────────────────────────────
exports.handleOAuthCallback = (0, https_1.onRequest)({ secrets: [env_js_1.TOKEN_ENCRYPTION_KEY] }, async (req, res) => {
    const platformId = req.query.platform_id || req.params[0];
    const code = req.query.code;
    const state = req.query.state;
    const error = req.query.error;
    if (error) {
        res.redirect(`${env_js_1.FRONTEND_URL.value()}/connections?error=${encodeURIComponent(error)}`);
        return;
    }
    if (!code || !state) {
        res.redirect(`${env_js_1.FRONTEND_URL.value()}/connections?error=missing_params`);
        return;
    }
    try {
        // Verify state
        const stateRef = firebase_js_1.db.collection("oauthStates").doc(state);
        const stateSnap = await stateRef.get();
        if (!stateSnap.exists) {
            res.redirect(`${env_js_1.FRONTEND_URL.value()}/connections?error=invalid_state`);
            return;
        }
        const stateData = stateSnap.data();
        await stateRef.delete();
        if (stateData.platformId !== platformId) {
            res.redirect(`${env_js_1.FRONTEND_URL.value()}/connections?error=state_mismatch`);
            return;
        }
        const config = (0, oauthConfigs_js_1.getOAuthConfig)(platformId);
        if (!config) {
            res.redirect(`${env_js_1.FRONTEND_URL.value()}/connections?error=invalid_platform`);
            return;
        }
        // Exchange code for tokens
        const clientId = process.env[config.clientIdEnv] || "";
        const clientSecret = process.env[config.clientSecretEnv] || "";
        const redirectUri = `${env_js_1.FRONTEND_URL.value()}/api/oauth/callback/${platformId}`;
        const clientIdField = platformId === "tiktok" ? "client_key" : "client_id";
        const tokenBody = new URLSearchParams({
            [clientIdField]: clientId,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            ...(config.tokenAuthMethod !== "basic_auth" ? { client_secret: clientSecret } : {}),
            ...(stateData.codeVerifier ? { code_verifier: stateData.codeVerifier } : {}),
            ...config.extraTokenParams,
        });
        const headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        };
        if (config.tokenAuthMethod === "basic_auth") {
            headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
        }
        const tokenResp = await fetch(config.tokenUrl, {
            method: "POST",
            headers,
            body: tokenBody,
        });
        if (!tokenResp.ok) {
            console.error("Token exchange failed:", await tokenResp.text());
            res.redirect(`${env_js_1.FRONTEND_URL.value()}/connections?error=token_exchange_failed`);
            return;
        }
        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token || "";
        const refreshToken = tokenData.refresh_token || null;
        const expiresIn = tokenData.expires_in ? Number(tokenData.expires_in) : null;
        // Fetch user info
        let platformUserId = null;
        let platformUsername = null;
        if (config.userinfoUrl && accessToken) {
            try {
                const infoResp = await fetch(config.userinfoUrl, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (infoResp.ok) {
                    const info = await infoResp.json();
                    [platformUserId, platformUsername] = extractUserInfo(platformId, info);
                }
            }
            catch {
                // non-fatal
            }
        }
        // Encrypt and store
        const workspaceId = stateData.workspaceId;
        const encryptedAccess = accessToken ? (0, encryption_js_1.encryptToken)(accessToken) : null;
        const encryptedRefresh = refreshToken ? (0, encryption_js_1.encryptToken)(refreshToken) : null;
        const tokenExpiresAt = expiresIn ? firestore_1.Timestamp.fromDate(new Date(Date.now() + expiresIn * 1000)) : null;
        // Upsert connection
        const existingConn = await firebase_js_1.db
            .collection(collections_js_1.Collections.PLATFORM_CONNECTIONS)
            .where("workspaceId", "==", workspaceId)
            .where("platformId", "==", platformId)
            .limit(1)
            .get();
        if (!existingConn.empty) {
            await existingConn.docs[0].ref.update({
                platformUserId,
                platformUsername,
                accessTokenEncrypted: encryptedAccess,
                refreshTokenEncrypted: encryptedRefresh,
                tokenExpiresAt,
                scopes: config.scopes,
                isActive: true,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        else {
            await firebase_js_1.db.collection(collections_js_1.Collections.PLATFORM_CONNECTIONS).add({
                workspaceId,
                platformId,
                platformUserId,
                platformUsername,
                accessTokenEncrypted: encryptedAccess,
                refreshTokenEncrypted: encryptedRefresh,
                tokenExpiresAt,
                scopes: config.scopes,
                isActive: true,
                followerCount: null,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        res.redirect(`${env_js_1.FRONTEND_URL.value()}/connections?success=true&platform=${platformId}`);
    }
    catch (err) {
        console.error("OAuth callback error:", err);
        res.redirect(`${env_js_1.FRONTEND_URL.value()}/connections?error=internal`);
    }
});
// ─── listConnections ─────────────────────────────────────────────────────────
exports.listConnections = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const snap = await firebase_js_1.db
            .collection(collections_js_1.Collections.PLATFORM_CONNECTIONS)
            .where("workspaceId", "==", ctx.workspaceId)
            .get();
        const items = snap.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                workspace_id: data.workspaceId,
                platform_id: data.platformId,
                platform_username: data.platformUsername || "",
                is_active: data.isActive ?? false,
                created_at: data.createdAt ? data.createdAt.toDate().toISOString() : null,
            };
        });
        return { items, total: items.length };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── disconnectPlatform ──────────────────────────────────────────────────────
exports.disconnectPlatform = (0, https_1.onCall)({ secrets: [env_js_1.TOKEN_ENCRYPTION_KEY] }, async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const input = (0, validate_js_1.validate)(schemas_js_1.DisconnectPlatformSchema, request.data);
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.PLATFORM_CONNECTIONS).doc(input.connection_id);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Connection not found");
        if (snap.data().workspaceId !== ctx.workspaceId) {
            throw new errors_js_1.NotFoundError("Connection not found");
        }
        await docRef.update({
            isActive: false,
            accessTokenEncrypted: null,
            refreshTokenEncrypted: null,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── refreshConnection ──────────────────────────────────────────────────────
exports.refreshConnection = (0, https_1.onCall)({ secrets: [env_js_1.TOKEN_ENCRYPTION_KEY] }, async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const connectionId = request.data?.connection_id;
        if (!connectionId)
            throw new errors_js_1.NotFoundError("connection_id required");
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.PLATFORM_CONNECTIONS).doc(connectionId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Connection not found");
        const data = snap.data();
        if (data.workspaceId !== ctx.workspaceId)
            throw new errors_js_1.NotFoundError("Connection not found");
        const platformId = data.platformId;
        const publisher = (0, registry_js_1.getPublisher)(platformId);
        if (!publisher)
            throw new errors_js_1.ValidationError("No publisher for this platform");
        const tokens = {
            accessToken: data.accessTokenEncrypted ? (0, encryption_js_1.decryptToken)(data.accessTokenEncrypted) : "",
            refreshToken: data.refreshTokenEncrypted ? (0, encryption_js_1.decryptToken)(data.refreshTokenEncrypted) : null,
            platformUserId: data.platformUserId || null,
            platformUsername: data.platformUsername || null,
        };
        const refreshed = await publisher.refreshToken(tokens, platformId);
        if (!refreshed) {
            throw new errors_js_1.ValidationError("Token refresh failed", "Could not refresh the token. You may need to reconnect.");
        }
        await docRef.update({
            accessTokenEncrypted: (0, encryption_js_1.encryptToken)(refreshed.accessToken),
            refreshTokenEncrypted: refreshed.refreshToken ? (0, encryption_js_1.encryptToken)(refreshed.refreshToken) : data.refreshTokenEncrypted,
            tokenExpiresAt: refreshed.expiresIn
                ? firestore_1.Timestamp.fromDate(new Date(Date.now() + refreshed.expiresIn * 1000))
                : data.tokenExpiresAt,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
function extractUserInfo(platformId, info) {
    switch (platformId) {
        case "twitter": {
            const data = (info.data || info);
            return [data.id ?? null, data.username ?? null];
        }
        case "linkedin":
            return [info.sub ?? null, info.name ?? null];
        case "instagram":
            return [info.id ?? null, info.username ?? null];
        case "youtube": {
            const items = (info.items || []);
            if (items.length > 0) {
                return [items[0].id ?? null, items[0].snippet?.title ?? null];
            }
            return [null, null];
        }
        case "tiktok": {
            const data = (info.data?.user || info);
            return [(data.open_id || data.union_id) ?? null, data.display_name ?? null];
        }
        case "pinterest":
            return [info.username ?? null, info.username ?? null];
        case "reddit":
            return [info.id ?? null, info.name ?? null];
        case "medium": {
            const data = (info.data || info);
            return [data.id ?? null, data.username ?? null];
        }
        default:
            return [info.id ?? null, (info.username || info.name) ?? null];
    }
}
//# sourceMappingURL=connections.js.map