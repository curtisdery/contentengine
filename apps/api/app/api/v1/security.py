"""Security API routes — Firestore-backed session management, audit log, and panic button."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request, status

from app.core.firestore import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


# ---------------------------------------------------------------------------
# Session Management
# ---------------------------------------------------------------------------


@router.get("/sessions")
async def list_sessions(
    current_user=Depends(get_current_user),
) -> list[dict]:
    """List active sessions for the current user."""
    db = get_db()
    query = (
        db.collection("sessions")
        .where("user_id", "==", current_user.id)
        .where("is_active", "==", True)
        .order_by("created_at", direction="DESCENDING")
    )

    sessions = []
    async for doc in query.stream():
        sessions.append({**doc.to_dict(), "id": doc.id})

    return sessions


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: str,
    request: Request,
    current_user=Depends(get_current_user),
) -> None:
    """Revoke a specific session."""
    db = get_db()
    doc = await db.collection("sessions").document(session_id).get()

    if not doc.exists or doc.to_dict().get("user_id") != current_user.id:
        from app.utils.exceptions import NotFoundError
        raise NotFoundError(message="Session not found", detail=f"No session found with id {session_id}")

    await db.collection("sessions").document(session_id).update({"is_active": False})

    # Audit log
    await _log_audit(db, current_user.id, "session_revoke", "session", session_id, request)


@router.delete("/sessions", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_all_sessions(
    request: Request,
    current_user=Depends(get_current_user),
) -> None:
    """Revoke all sessions for the current user."""
    db = get_db()
    query = (
        db.collection("sessions")
        .where("user_id", "==", current_user.id)
        .where("is_active", "==", True)
    )

    revoked_count = 0
    async for doc in query.stream():
        await db.collection("sessions").document(doc.id).update({"is_active": False})
        revoked_count += 1

    await _log_audit(
        db, current_user.id, "session_revoke_all", "session", None, request,
        metadata={"revoked_count": revoked_count},
    )


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------


@router.get("/audit-log")
async def get_audit_log(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
) -> dict:
    """Get the current user's audit log (paginated)."""
    db = get_db()
    query = (
        db.collection("audit_logs")
        .where("user_id", "==", current_user.id)
        .order_by("created_at", direction="DESCENDING")
    )

    all_items = []
    async for doc in query.stream():
        all_items.append({**doc.to_dict(), "id": doc.id})

    total = len(all_items)
    items = all_items[offset : offset + limit]

    return {"items": items, "total": total}


@router.get("/events")
async def get_security_events(
    days: int = Query(30, ge=1, le=365),
    current_user=Depends(get_current_user),
) -> list[dict]:
    """Get security-relevant events for the current user."""
    db = get_db()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    security_actions = {"login", "logout", "session_revoke", "session_revoke_all", "panic_button", "password_change"}

    query = (
        db.collection("audit_logs")
        .where("user_id", "==", current_user.id)
        .order_by("created_at", direction="DESCENDING")
    )

    events = []
    async for doc in query.stream():
        data = doc.to_dict()
        created_at = data.get("created_at")
        if created_at and created_at >= cutoff and data.get("action") in security_actions:
            events.append({**data, "id": doc.id})

    return events


# ---------------------------------------------------------------------------
# Panic Button
# ---------------------------------------------------------------------------


@router.post("/panic")
async def panic_button(
    request: Request,
    current_user=Depends(get_current_user),
) -> dict:
    """Panic button: revoke all platform connections and all sessions."""
    db = get_db()

    # 1. Revoke all platform connections
    conn_query = (
        db.collection("connected_platforms")
        .where("user_id", "==", current_user.id)
        .where("is_active", "==", True)
    )
    connections_revoked = 0
    async for doc in conn_query.stream():
        await db.collection("connected_platforms").document(doc.id).update({"is_active": False})
        connections_revoked += 1

    # 2. Revoke all sessions
    session_query = (
        db.collection("sessions")
        .where("user_id", "==", current_user.id)
        .where("is_active", "==", True)
    )
    sessions_revoked = 0
    async for doc in session_query.stream():
        await db.collection("sessions").document(doc.id).update({"is_active": False})
        sessions_revoked += 1

    # 3. Disable autopilot configs
    autopilot_query = (
        db.collection("autopilot_configs")
        .where("user_id", "==", current_user.id)
        .where("enabled", "==", True)
    )
    async for doc in autopilot_query.stream():
        await db.collection("autopilot_configs").document(doc.id).update({"enabled": False})

    # 4. Audit log
    await _log_audit(
        db, current_user.id, "panic_button", "account", current_user.id, request,
        metadata={"connections_revoked": connections_revoked, "sessions_revoked": sessions_revoked},
    )

    return {
        "status": "emergency_lockdown_complete",
        "connections_revoked": connections_revoked,
        "sessions_revoked": sessions_revoked,
        "message": (
            f"Revoked {connections_revoked} platform connection(s) and "
            f"{sessions_revoked} session(s). Please change your password and "
            f"re-authenticate."
        ),
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _log_audit(
    db, user_id: str, action: str, resource_type: str,
    resource_id: str | None, request: Request, metadata: dict | None = None,
) -> None:
    """Write an audit log entry to Firestore."""
    await db.collection("audit_logs").document().set({
        "user_id": user_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
        "metadata": metadata,
        "created_at": datetime.now(timezone.utc),
    })
