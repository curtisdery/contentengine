"""Platform connection API routes — Firestore-backed."""

from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import RedirectResponse

from app.config import get_settings
from app.core.encryption import encrypt
from app.core.firestore import get_db
from app.middleware.auth import get_current_user
from app.services.platforms.base import get_platform_service
from app.utils.exceptions import NotFoundError

router = APIRouter()
settings = get_settings()


# ── GET /api/v1/platforms ──────────────────────────────────────────────

@router.get("")
async def list_connections(current_user=Depends(get_current_user)) -> list[dict]:
    """List all platform connections for the current user (EXCLUDES tokens)."""
    db = get_db()
    query = db.collection("connected_platforms").where("user_id", "==", current_user.id)
    connections = []
    async for doc in query.stream():
        data = doc.to_dict()
        connections.append({
            "id": doc.id,
            "platform": data.get("platform"),
            "platform_user_id": data.get("platform_user_id"),
            "platform_username": data.get("platform_username"),
            "is_active": data.get("is_active", False),
            "token_expires_at": data.get("token_expires_at"),
            "scopes": data.get("scopes", []),
            "created_at": data.get("created_at"),
        })
    return connections


# ── GET /api/v1/platforms/oauth-url?platform=TWITTER ───────────────────

@router.get("/oauth-url")
async def get_oauth_url(
    platform: str = Query(...),
    current_user=Depends(get_current_user),
) -> dict:
    """Generate an OAuth authorize URL for a platform."""
    service = get_platform_service(platform.lower())
    url = await service.get_auth_url(user_id=current_user.id)
    return {"authorize_url": url}


# ── POST /api/v1/platforms/callback ────────────────────────────────────

@router.post("/callback")
async def oauth_callback_post(
    platform: str = Query(...),
    code: str = Query(...),
    state: str = Query(...),
) -> dict:
    """Handle OAuth callback — exchange code for tokens and store connection."""
    service = get_platform_service(platform.lower())
    return await service.exchange_code(code=code, state=state)


@router.get("/callback/{platform_id}")
async def oauth_callback_redirect(
    platform_id: str,
    code: str = Query(default=""),
    state: str = Query(default=""),
    error: str = Query(default=""),
) -> RedirectResponse:
    """Handle OAuth provider redirect callback — redirect to frontend."""
    frontend_callback = f"{settings.FRONTEND_URL}/oauth/callback"

    if error:
        return RedirectResponse(
            url=f"{frontend_callback}?status=error&platform={platform_id}&error={error}"
        )
    if not code or not state:
        return RedirectResponse(
            url=f"{frontend_callback}?status=error&platform={platform_id}&error=missing_code_or_state"
        )

    try:
        service = get_platform_service(platform_id)
        result = await service.exchange_code(code=code, state=state)
        username = result.get("platform_username", "")
        return RedirectResponse(
            url=f"{frontend_callback}?status=success&platform={platform_id}&username={username}"
        )
    except Exception as exc:
        error_msg = str(exc) if str(exc) else "unknown_error"
        return RedirectResponse(
            url=f"{frontend_callback}?status=error&platform={platform_id}&error={error_msg}"
        )


# ── DELETE /api/v1/platforms/{platform_id} ─────────────────────────────

@router.delete("/{platform_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_platform(
    platform_id: str,
    current_user=Depends(get_current_user),
) -> None:
    """Disconnect a platform (soft-delete)."""
    db = get_db()
    query = (
        db.collection("connected_platforms")
        .where("user_id", "==", current_user.id)
        .where("platform", "==", platform_id)
        .where("is_active", "==", True)
        .limit(1)
    )
    docs = [doc async for doc in query.stream()]
    if not docs:
        raise NotFoundError(
            message="Connection not found",
            detail=f"No active connection found for platform '{platform_id}'.",
        )
    await docs[0].reference.update({
        "is_active": False,
        "updated_at": datetime.utcnow(),
    })


# ── POST /api/v1/platforms/disconnect-all ──────────────────────────────

@router.post("/disconnect-all", status_code=status.HTTP_200_OK)
async def disconnect_all(current_user=Depends(get_current_user)) -> dict:
    """Panic button — disconnect all platforms for the current user."""
    db = get_db()
    query = (
        db.collection("connected_platforms")
        .where("user_id", "==", current_user.id)
        .where("is_active", "==", True)
    )
    count = 0
    async for doc in query.stream():
        await doc.reference.update({
            "is_active": False,
            "updated_at": datetime.utcnow(),
        })
        count += 1
    return {"disconnected": count}


# ── Bluesky app-password ──────────────────────────────────────────────

from pydantic import BaseModel


class AppPasswordRequest(BaseModel):
    handle: str
    app_password: str


@router.post("/bluesky/app-password", status_code=status.HTTP_201_CREATED)
async def bluesky_app_password(
    body: AppPasswordRequest,
    current_user=Depends(get_current_user),
) -> dict:
    """Authenticate to Bluesky via AT Protocol app password."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            "https://bsky.social/xrpc/com.atproto.server.createSession",
            json={"identifier": body.handle, "password": body.app_password},
        )

    if resp.status_code != 200:
        from app.utils.exceptions import ValidationError
        raise ValidationError(
            message="Authentication failed",
            detail="Invalid Bluesky handle or app password.",
        )

    session = resp.json()
    db = get_db()
    connection_data = {
        "user_id": current_user.id,
        "platform": "bluesky",
        "platform_user_id": session.get("did", ""),
        "platform_username": session.get("handle", body.handle),
        "access_token_encrypted": encrypt(body.app_password),
        "refresh_token_encrypted": None,
        "token_expires_at": None,
        "scopes": [],
        "is_active": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    # Upsert
    query = (
        db.collection("connected_platforms")
        .where("user_id", "==", current_user.id)
        .where("platform", "==", "bluesky")
        .limit(1)
    )
    existing = [doc async for doc in query.stream()]
    if existing:
        await existing[0].reference.update(connection_data)
        return {**connection_data, "id": existing[0].id}
    else:
        ref = await db.collection("connected_platforms").add(connection_data)
        return {**connection_data, "id": ref[1].id}
