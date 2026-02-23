/**
 * Connections API — 5 functions: getOAuthURL, handleOAuthCallback (onRequest), listConnections, disconnectPlatform, refreshConnection.
 * Port of apps/api/app/services/oauth.py.
 */

import { onCall, onRequest } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { randomBytes, createHash } from "crypto";
import { db } from "../config/firebase.js";
import { TOKEN_ENCRYPTION_KEY, FRONTEND_URL } from "../config/env.js";
import { verifyAuth } from "../middleware/auth.js";
import { assertRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { GetOAuthURLSchema, DisconnectPlatformSchema } from "../shared/schemas.js";
import { wrapError, NotFoundError, ValidationError } from "../shared/errors.js";
import { docToResponse } from "../shared/transform.js";
import { encryptToken, decryptToken } from "../lib/encryption.js";
import { getOAuthConfig, AuthMethod } from "../lib/platforms/oauthConfigs.js";
import { getPublisher } from "../lib/platforms/publishers/registry.js";

// ─── getOAuthURL ─────────────────────────────────────────────────────────────
export const getOAuthURL = onCall({ secrets: [TOKEN_ENCRYPTION_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const input = validate(GetOAuthURLSchema, request.data);

    const config = getOAuthConfig(input.platform_id);
    if (!config || config.authMethod !== AuthMethod.OAUTH2) {
      throw new ValidationError("OAuth not supported", `Platform '${input.platform_id}' does not support OAuth.`);
    }

    const clientId = process.env[config.clientIdEnv] || "";
    if (!clientId) {
      throw new ValidationError("Platform not configured", `OAuth credentials for '${input.platform_id}' are not configured.`);
    }

    // State token
    const state = randomBytes(32).toString("base64url");

    // PKCE
    let codeVerifier: string | null = null;
    let codeChallenge: string | null = null;
    if (config.usesPkce) {
      codeVerifier = randomBytes(96).toString("base64url");
      const digest = createHash("sha256").update(codeVerifier).digest();
      codeChallenge = digest.toString("base64url");
    }

    // Store state in Firestore (TTL 10 minutes — cleaned up by cleanup cron)
    await db.collection("oauthStates").doc(state).set({
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      platformId: input.platform_id,
      codeVerifier,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 600_000)),
      createdAt: FieldValue.serverTimestamp(),
    });

    // Build authorize URL
    const redirectUri = `${FRONTEND_URL.value()}/api/oauth/callback/${input.platform_id}`;
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
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── handleOAuthCallback (onRequest) ─────────────────────────────────────────
export const handleOAuthCallback = onRequest({ secrets: [TOKEN_ENCRYPTION_KEY] }, async (req, res) => {
  const platformId = req.query.platform_id as string || req.params[0];
  const code = req.query.code as string;
  const state = req.query.state as string;
  const error = req.query.error as string;

  if (error) {
    res.redirect(`${FRONTEND_URL.value()}/connections?error=${encodeURIComponent(error)}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${FRONTEND_URL.value()}/connections?error=missing_params`);
    return;
  }

  try {
    // Verify state
    const stateRef = db.collection("oauthStates").doc(state);
    const stateSnap = await stateRef.get();

    if (!stateSnap.exists) {
      res.redirect(`${FRONTEND_URL.value()}/connections?error=invalid_state`);
      return;
    }

    const stateData = stateSnap.data() as Record<string, unknown>;
    await stateRef.delete();

    if (stateData.platformId !== platformId) {
      res.redirect(`${FRONTEND_URL.value()}/connections?error=state_mismatch`);
      return;
    }

    const config = getOAuthConfig(platformId);
    if (!config) {
      res.redirect(`${FRONTEND_URL.value()}/connections?error=invalid_platform`);
      return;
    }

    // Exchange code for tokens
    const clientId = process.env[config.clientIdEnv] || "";
    const clientSecret = process.env[config.clientSecretEnv] || "";
    const redirectUri = `${FRONTEND_URL.value()}/api/oauth/callback/${platformId}`;
    const clientIdField = platformId === "tiktok" ? "client_key" : "client_id";

    const tokenBody = new URLSearchParams({
      [clientIdField]: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      ...(config.tokenAuthMethod !== "basic_auth" ? { client_secret: clientSecret } : {}),
      ...(stateData.codeVerifier ? { code_verifier: stateData.codeVerifier as string } : {}),
      ...config.extraTokenParams,
    });

    const headers: Record<string, string> = {
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
      res.redirect(`${FRONTEND_URL.value()}/connections?error=token_exchange_failed`);
      return;
    }

    const tokenData = await tokenResp.json() as Record<string, unknown>;
    const accessToken = (tokenData.access_token as string) || "";
    const refreshToken = (tokenData.refresh_token as string) || null;
    const expiresIn = tokenData.expires_in ? Number(tokenData.expires_in) : null;

    // Fetch user info
    let platformUserId: string | null = null;
    let platformUsername: string | null = null;

    if (config.userinfoUrl && accessToken) {
      try {
        const infoResp = await fetch(config.userinfoUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (infoResp.ok) {
          const info = await infoResp.json() as Record<string, unknown>;
          [platformUserId, platformUsername] = extractUserInfo(platformId, info as Record<string, unknown>);
        }
      } catch {
        // non-fatal
      }
    }

    // Encrypt and store
    const workspaceId = stateData.workspaceId as string;
    const encryptedAccess = accessToken ? encryptToken(accessToken) : null;
    const encryptedRefresh = refreshToken ? encryptToken(refreshToken) : null;
    const tokenExpiresAt = expiresIn ? Timestamp.fromDate(new Date(Date.now() + expiresIn * 1000)) : null;

    // Upsert connection
    const existingConn = await db
      .collection(Collections.PLATFORM_CONNECTIONS)
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
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await db.collection(Collections.PLATFORM_CONNECTIONS).add({
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
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    res.redirect(`${FRONTEND_URL.value()}/connections?success=true&platform=${platformId}`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.redirect(`${FRONTEND_URL.value()}/connections?error=internal`);
  }
});

// ─── listConnections ─────────────────────────────────────────────────────────
export const listConnections = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    const snap = await db
      .collection(Collections.PLATFORM_CONNECTIONS)
      .where("workspaceId", "==", ctx.workspaceId)
      .get();

    const items = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        workspace_id: data.workspaceId,
        platform_id: data.platformId,
        platform_username: data.platformUsername || "",
        is_active: data.isActive ?? false,
        created_at: data.createdAt ? (data.createdAt as FirebaseFirestore.Timestamp).toDate().toISOString() : null,
      };
    });

    return { items, total: items.length };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── disconnectPlatform ──────────────────────────────────────────────────────
export const disconnectPlatform = onCall({ secrets: [TOKEN_ENCRYPTION_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const input = validate(DisconnectPlatformSchema, request.data);

    const docRef = db.collection(Collections.PLATFORM_CONNECTIONS).doc(input.connection_id);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Connection not found");
    if ((snap.data() as Record<string, unknown>).workspaceId !== ctx.workspaceId) {
      throw new NotFoundError("Connection not found");
    }

    await docRef.update({
      isActive: false,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── refreshConnection ──────────────────────────────────────────────────────
export const refreshConnection = onCall({ secrets: [TOKEN_ENCRYPTION_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const connectionId = request.data?.connection_id as string;
    if (!connectionId) throw new NotFoundError("connection_id required");

    const docRef = db.collection(Collections.PLATFORM_CONNECTIONS).doc(connectionId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Connection not found");

    const data = snap.data() as Record<string, unknown>;
    if (data.workspaceId !== ctx.workspaceId) throw new NotFoundError("Connection not found");

    const platformId = data.platformId as string;
    const publisher = getPublisher(platformId);
    if (!publisher) throw new ValidationError("No publisher for this platform");

    const tokens = {
      accessToken: data.accessTokenEncrypted ? decryptToken(data.accessTokenEncrypted as string) : "",
      refreshToken: data.refreshTokenEncrypted ? decryptToken(data.refreshTokenEncrypted as string) : null,
      platformUserId: (data.platformUserId as string) || null,
      platformUsername: (data.platformUsername as string) || null,
    };

    const refreshed = await publisher.refreshToken(tokens, platformId);
    if (!refreshed) {
      throw new ValidationError("Token refresh failed", "Could not refresh the token. You may need to reconnect.");
    }

    await docRef.update({
      accessTokenEncrypted: encryptToken(refreshed.accessToken),
      refreshTokenEncrypted: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : data.refreshTokenEncrypted,
      tokenExpiresAt: refreshed.expiresIn
        ? Timestamp.fromDate(new Date(Date.now() + refreshed.expiresIn * 1000))
        : data.tokenExpiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (err) {
    throw wrapError(err);
  }
});

function extractUserInfo(platformId: string, info: Record<string, unknown>): [string | null, string | null] {
  switch (platformId) {
    case "twitter": {
      const data = (info.data || info) as Record<string, unknown>;
      return [data.id as string ?? null, data.username as string ?? null];
    }
    case "linkedin":
      return [info.sub as string ?? null, info.name as string ?? null];
    case "instagram":
      return [info.id as string ?? null, info.username as string ?? null];
    case "youtube": {
      const items = (info.items || []) as Array<Record<string, unknown>>;
      if (items.length > 0) {
        return [items[0].id as string ?? null, ((items[0].snippet as Record<string, unknown>)?.title as string) ?? null];
      }
      return [null, null];
    }
    case "tiktok": {
      const data = ((info.data as Record<string, unknown>)?.user || info) as Record<string, unknown>;
      return [(data.open_id || data.union_id) as string ?? null, data.display_name as string ?? null];
    }
    case "pinterest":
      return [info.username as string ?? null, info.username as string ?? null];
    case "reddit":
      return [info.id as string ?? null, info.name as string ?? null];
    case "medium": {
      const data = (info.data || info) as Record<string, unknown>;
      return [data.id as string ?? null, data.username as string ?? null];
    }
    default:
      return [info.id as string ?? null, (info.username || info.name) as string ?? null];
  }
}
