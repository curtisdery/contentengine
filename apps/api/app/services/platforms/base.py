"""Base platform service — abstract interface for OAuth + profile fetching."""

from __future__ import annotations

import hashlib
import logging
import secrets
from abc import ABC, abstractmethod
from base64 import urlsafe_b64encode
from datetime import datetime, timedelta, timezone

import httpx

from app.config import get_settings
from app.core.encryption import encrypt, decrypt
from app.core.firestore import get_db
from app.platforms.oauth_configs import get_oauth_config, AuthMethod, TokenAuthMethod
from app.utils.exceptions import NotFoundError, ValidationError

logger = logging.getLogger(__name__)
settings = get_settings()


class BasePlatform(ABC):
    """Abstract base for all platform integrations."""

    platform_id: str

    # ── OAuth URL generation ──────────────────────────────────────────

    async def get_auth_url(self, user_id: str) -> str:
        """Generate an OAuth authorize URL and store state in Firestore."""
        config = get_oauth_config(self.platform_id)
        if not config or config.auth_method != AuthMethod.OAUTH2:
            raise ValidationError(
                message="OAuth not supported",
                detail=f"Platform '{self.platform_id}' does not support OAuth.",
            )

        client_id = getattr(settings, config.client_id_env, "")
        if not client_id:
            raise ValidationError(
                message="Platform not configured",
                detail=f"OAuth credentials for '{self.platform_id}' are not configured.",
            )

        state = secrets.token_urlsafe(32)
        code_verifier = None
        code_challenge = None

        if config.uses_pkce:
            code_verifier = secrets.token_urlsafe(96)
            digest = hashlib.sha256(code_verifier.encode()).digest()
            code_challenge = urlsafe_b64encode(digest).rstrip(b"=").decode()

        # Store state in Firestore with TTL
        db = get_db()
        await db.collection("oauth_states").document(state).set({
            "user_id": user_id,
            "platform": self.platform_id,
            "code_verifier": code_verifier,
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(minutes=10),
        })

        redirect_uri = f"{settings.BACKEND_URL}/api/v1/connections/callback/{self.platform_id}"
        client_id_param = "client_key" if self.platform_id == "tiktok" else "client_id"

        params = {
            client_id_param: client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(config.scopes) if config.scopes else "",
            "state": state,
        }
        if code_challenge:
            params["code_challenge"] = code_challenge
            params["code_challenge_method"] = "S256"
        params.update(config.extra_authorize_params)
        params = {k: v for k, v in params.items() if v}

        from urllib.parse import urlencode
        return f"{config.authorize_url}?{urlencode(params)}"

    # ── Token exchange ────────────────────────────────────────────────

    async def exchange_code(self, code: str, state: str) -> dict:
        """Exchange authorization code for tokens and store the connection."""
        config = get_oauth_config(self.platform_id)
        db = get_db()

        # Retrieve and delete state
        state_ref = db.collection("oauth_states").document(state)
        state_doc = await state_ref.get()
        if not state_doc.exists:
            raise ValidationError(
                message="Invalid state",
                detail="OAuth state is invalid or expired. Please try again.",
            )
        state_data = state_doc.to_dict()
        await state_ref.delete()

        if state_data["platform"] != self.platform_id:
            raise ValidationError(
                message="State mismatch",
                detail="OAuth state does not match the expected platform.",
            )

        # Build token request
        redirect_uri = f"{settings.BACKEND_URL}/api/v1/connections/callback/{self.platform_id}"
        client_id = getattr(settings, config.client_id_env, "")
        client_secret = getattr(settings, config.client_secret_env, "")
        client_id_field = "client_key" if self.platform_id == "tiktok" else "client_id"

        token_body = {
            client_id_field: client_id,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        }
        if config.token_auth_method != TokenAuthMethod.BASIC_AUTH:
            token_body["client_secret"] = client_secret
        if state_data.get("code_verifier"):
            token_body["code_verifier"] = state_data["code_verifier"]
        token_body.update(config.extra_token_params)

        headers = {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}
        auth = httpx.BasicAuth(client_id, client_secret) if config.token_auth_method == TokenAuthMethod.BASIC_AUTH else None

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(config.token_url, data=token_body, headers=headers, auth=auth)

        if resp.status_code >= 400:
            logger.error("Token exchange failed for %s: %s %s", self.platform_id, resp.status_code, resp.text)
            raise ValidationError(
                message="Token exchange failed",
                detail=f"Could not complete OAuth for {self.platform_id}. Please try again.",
            )

        token_data = resp.json()
        access_token = token_data.get("access_token", "")
        refresh_token_val = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in")

        token_expires_at = None
        if expires_in:
            token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))

        # Fetch profile
        profile = await self.get_profile(access_token) if access_token else {}

        # Store connection in Firestore
        user_id = state_data["user_id"]
        connection_data = {
            "user_id": user_id,
            "platform": self.platform_id,
            "platform_user_id": profile.get("platform_user_id"),
            "platform_username": profile.get("platform_username"),
            "access_token_encrypted": encrypt(access_token) if access_token else None,
            "refresh_token_encrypted": encrypt(refresh_token_val) if refresh_token_val else None,
            "token_expires_at": token_expires_at,
            "scopes": config.scopes,
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        # Upsert: check for existing connection
        query = (
            db.collection("connected_platforms")
            .where("user_id", "==", user_id)
            .where("platform", "==", self.platform_id)
            .limit(1)
        )
        existing = [doc async for doc in query.stream()]
        if existing:
            await existing[0].reference.update(connection_data)
            connection_id = existing[0].id
        else:
            ref = await db.collection("connected_platforms").add(connection_data)
            connection_id = ref[1].id

        return {
            "connection_id": connection_id,
            "platform": self.platform_id,
            "platform_username": profile.get("platform_username", ""),
            "status": "connected",
        }

    # ── Token refresh ─────────────────────────────────────────────────

    async def refresh_token(self, connection_id: str) -> dict:
        """Refresh an expired access token using the stored refresh token."""
        config = get_oauth_config(self.platform_id)
        db = get_db()

        doc = await db.collection("connected_platforms").document(connection_id).get()
        if not doc.exists:
            raise NotFoundError(message="Connection not found", detail="Platform connection does not exist.")

        data = doc.to_dict()
        if not data.get("refresh_token_encrypted"):
            raise ValidationError(message="No refresh token", detail="This connection has no refresh token stored.")

        refresh_tok = decrypt(data["refresh_token_encrypted"])
        client_id = getattr(settings, config.client_id_env, "")
        client_secret = getattr(settings, config.client_secret_env, "")

        token_body = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_tok,
            "client_id": client_id,
            "client_secret": client_secret,
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(config.token_url, data=token_body)

        if resp.status_code >= 400:
            logger.error("Token refresh failed for %s: %s", self.platform_id, resp.text)
            raise ValidationError(message="Token refresh failed", detail="Could not refresh token. User may need to reconnect.")

        token_data = resp.json()
        new_access = token_data.get("access_token", "")
        new_refresh = token_data.get("refresh_token", refresh_tok)
        expires_in = token_data.get("expires_in")

        updates = {
            "access_token_encrypted": encrypt(new_access),
            "updated_at": datetime.utcnow(),
        }
        if new_refresh != refresh_tok:
            updates["refresh_token_encrypted"] = encrypt(new_refresh)
        if expires_in:
            updates["token_expires_at"] = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))

        await db.collection("connected_platforms").document(connection_id).update(updates)

        return {"connection_id": connection_id, "status": "refreshed"}

    # ── Revoke token ──────────────────────────────────────────────────

    async def revoke_token(self, connection_id: str) -> dict:
        """Revoke access and mark connection inactive."""
        db = get_db()
        doc = await db.collection("connected_platforms").document(connection_id).get()
        if not doc.exists:
            raise NotFoundError(message="Connection not found", detail="Platform connection does not exist.")

        await db.collection("connected_platforms").document(connection_id).update({
            "is_active": False,
            "updated_at": datetime.utcnow(),
        })

        return {"connection_id": connection_id, "status": "revoked"}

    # ── Profile (abstract) ────────────────────────────────────────────

    @abstractmethod
    async def get_profile(self, access_token: str) -> dict:
        """Fetch the user's profile from the platform API.

        Must return: {"platform_user_id": str, "platform_username": str, ...}
        """
        ...


# ── Registry ──────────────────────────────────────────────────────────

_REGISTRY: dict[str, BasePlatform] = {}


def get_platform_service(platform_id: str) -> BasePlatform:
    """Get the platform service instance for a given platform ID."""
    if not _REGISTRY:
        from app.services.platforms.twitter import TwitterPlatform
        from app.services.platforms.linkedin import LinkedInPlatform
        from app.services.platforms.instagram import InstagramPlatform
        from app.services.platforms.youtube import YouTubePlatform
        from app.services.platforms.tiktok import TikTokPlatform

        for cls in [TwitterPlatform, LinkedInPlatform, InstagramPlatform, YouTubePlatform, TikTokPlatform]:
            _REGISTRY[cls.platform_id] = cls()

    service = _REGISTRY.get(platform_id)
    if not service:
        raise ValidationError(
            message="Unsupported platform",
            detail=f"No platform service found for '{platform_id}'.",
        )
    return service
