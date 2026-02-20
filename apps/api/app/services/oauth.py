"""OAuth service — authorize URL generation, callback handling, token exchange."""

import hashlib
import json
import logging
import os
import secrets
from base64 import urlsafe_b64encode
from urllib.parse import urlencode

import httpx
import redis.asyncio as redis

from app.config import get_settings
from app.platforms.oauth_configs import (
    AuthMethod,
    TokenAuthMethod,
    get_oauth_config,
)
from app.utils.encryption import encrypt_token
from app.utils.exceptions import ValidationError

logger = logging.getLogger(__name__)

settings = get_settings()


async def _get_redis() -> redis.Redis:
    return redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=2,
    )


class OAuthService:
    """Handles the server-side OAuth 2.0 authorization-code flow."""

    async def generate_authorize_url(
        self,
        platform_id: str,
        user_id: str,
        workspace_id: str,
    ) -> str:
        config = get_oauth_config(platform_id)
        if not config or config.auth_method != AuthMethod.OAUTH2:
            raise ValidationError(
                message="OAuth not supported",
                detail=f"Platform '{platform_id}' does not support OAuth 2.0 authorization.",
            )

        client_id = os.environ.get(config.client_id_env, "") or getattr(settings, config.client_id_env, "")
        if not client_id:
            raise ValidationError(
                message="Platform not configured",
                detail=f"OAuth credentials for '{platform_id}' are not configured.",
            )

        # State token
        state = secrets.token_urlsafe(32)

        # PKCE
        code_verifier = None
        code_challenge = None
        if config.uses_pkce:
            code_verifier = secrets.token_urlsafe(96)
            digest = hashlib.sha256(code_verifier.encode()).digest()
            code_challenge = urlsafe_b64encode(digest).rstrip(b"=").decode()

        # Store state in Redis (TTL 600s = 10 min)
        r = await _get_redis()
        state_data = json.dumps(
            {
                "user_id": str(user_id),
                "workspace_id": str(workspace_id),
                "platform_id": platform_id,
                "code_verifier": code_verifier,
            }
        )
        await r.setex(f"oauth_state:{state}", 600, state_data)
        await r.aclose()

        # Build authorize URL
        redirect_uri = f"{settings.BACKEND_URL}/api/v1/connections/callback/{platform_id}"

        # TikTok uses client_key instead of client_id
        client_id_param = "client_key" if platform_id == "tiktok" else "client_id"

        params: dict[str, str] = {
            client_id_param: client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(config.scopes) if config.scopes else "",
            "state": state,
        }

        if code_challenge:
            params["code_challenge"] = code_challenge
            params["code_challenge_method"] = "S256"

        # Merge platform-specific extra params
        params.update(config.extra_authorize_params)

        # Remove empty values
        params = {k: v for k, v in params.items() if v}

        return f"{config.authorize_url}?{urlencode(params)}"

    async def handle_callback(
        self,
        db,
        platform_id: str,
        code: str,
        state: str,
    ) -> dict:
        config = get_oauth_config(platform_id)
        if not config or config.auth_method != AuthMethod.OAUTH2:
            raise ValidationError(
                message="Invalid platform",
                detail=f"Platform '{platform_id}' does not support OAuth callbacks.",
            )

        # Retrieve and delete state atomically
        r = await _get_redis()
        state_key = f"oauth_state:{state}"
        state_json = await r.get(state_key)
        if state_json:
            await r.delete(state_key)
        await r.aclose()

        if not state_json:
            raise ValidationError(
                message="Invalid state",
                detail="OAuth state token is invalid or expired. Please try connecting again.",
            )

        state_data = json.loads(state_json)
        if state_data["platform_id"] != platform_id:
            raise ValidationError(
                message="State mismatch",
                detail="OAuth state does not match the expected platform.",
            )

        # Exchange code for tokens
        redirect_uri = f"{settings.BACKEND_URL}/api/v1/connections/callback/{platform_id}"
        client_id = os.environ.get(config.client_id_env, "") or getattr(settings, config.client_id_env, "")
        client_secret = os.environ.get(config.client_secret_env, "") or getattr(settings, config.client_secret_env, "")

        # TikTok uses client_key instead of client_id
        client_id_field = "client_key" if platform_id == "tiktok" else "client_id"

        token_body: dict[str, str] = {
            client_id_field: client_id,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        }

        # Include client_secret in body unless using Basic Auth
        if config.token_auth_method != TokenAuthMethod.BASIC_AUTH:
            token_body["client_secret"] = client_secret

        # PKCE code_verifier
        code_verifier = state_data.get("code_verifier")
        if code_verifier:
            token_body["code_verifier"] = code_verifier

        # Extra token params
        token_body.update(config.extra_token_params)

        headers = {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}
        auth = None
        if config.token_auth_method == TokenAuthMethod.BASIC_AUTH:
            auth = httpx.BasicAuth(client_id, client_secret)

        async with httpx.AsyncClient(timeout=15) as client:
            token_resp = await client.post(
                config.token_url,
                data=token_body,
                headers=headers,
                auth=auth,
            )

        if token_resp.status_code >= 400:
            logger.error(
                "Token exchange failed for %s: %s %s",
                platform_id,
                token_resp.status_code,
                token_resp.text,
            )
            raise ValidationError(
                message="Token exchange failed",
                detail=f"Could not complete OAuth for {platform_id}. Please try again.",
            )

        token_data = token_resp.json()
        access_token = token_data.get("access_token", "")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in")

        from datetime import datetime, timedelta, timezone

        token_expires_at = None
        if expires_in:
            token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))

        # Fetch user info if endpoint is configured
        platform_user_id = None
        platform_username = None
        if config.userinfo_url and access_token:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    info_resp = await client.get(
                        config.userinfo_url,
                        headers={"Authorization": f"Bearer {access_token}"},
                    )
                if info_resp.status_code == 200:
                    info = info_resp.json()
                    platform_user_id, platform_username = _extract_user_info(
                        platform_id, info
                    )
            except Exception:
                logger.warning("Failed to fetch user info for %s", platform_id, exc_info=True)

        # Encrypt tokens
        encrypted_access = encrypt_token(access_token) if access_token else None
        encrypted_refresh = encrypt_token(refresh_token) if refresh_token else None

        # Store via PlatformConnectionService
        from app.services.platform_connection import PlatformConnectionService

        service = PlatformConnectionService()
        await service.connect_platform(
            db=db,
            workspace_id=state_data["workspace_id"],
            platform_id=platform_id,
            oauth_data={
                "platform_user_id": platform_user_id,
                "platform_username": platform_username,
                "access_token": encrypted_access,
                "refresh_token": encrypted_refresh,
                "token_expires_at": token_expires_at,
                "scopes": config.scopes,
            },
            already_encrypted=True,
        )

        return {
            "platform_id": platform_id,
            "platform_username": platform_username or "",
            "status": "success",
        }


def _extract_user_info(platform_id: str, info: dict) -> tuple[str | None, str | None]:
    """Extract platform_user_id and platform_username from a userinfo response."""
    uid = None
    uname = None

    if platform_id == "twitter":
        data = info.get("data", info)
        uid = data.get("id")
        uname = data.get("username")
    elif platform_id == "linkedin":
        uid = info.get("sub")
        uname = info.get("name")
    elif platform_id == "instagram":
        uid = info.get("id")
        uname = info.get("username")
    elif platform_id in ("facebook", "threads"):
        uid = info.get("id")
        uname = info.get("name") or info.get("username")
    elif platform_id == "youtube":
        items = info.get("items", [])
        if items:
            uid = items[0].get("id")
            uname = items[0].get("snippet", {}).get("title")
    elif platform_id == "tiktok":
        data = info.get("data", {}).get("user", info)
        uid = data.get("open_id") or data.get("union_id")
        uname = data.get("display_name")
    elif platform_id == "pinterest":
        uid = info.get("username")
        uname = info.get("username")
    elif platform_id == "reddit":
        uid = info.get("id")
        uname = info.get("name")
    elif platform_id == "medium":
        data = info.get("data", info)
        uid = data.get("id")
        uname = data.get("username")
    else:
        uid = info.get("id")
        uname = info.get("username") or info.get("name")

    return uid, uname
