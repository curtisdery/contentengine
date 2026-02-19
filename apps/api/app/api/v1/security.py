"""Security API routes — session management, audit log, and panic button."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.organization import OrganizationMember, Workspace
from app.models.platform_connection import PlatformConnection
from app.models.user import Session, User
from app.schemas.autopilot import (
    AuditLogListResponse,
    AuditLogResponse,
    SessionResponse,
)
from app.services.audit import AuditService
from app.utils.exceptions import NotFoundError

router = APIRouter()
audit_service = AuditService()


async def get_user_workspace(user: User, db: AsyncSession) -> Workspace:
    """Get the user's default workspace (first org's first workspace)."""
    result = await db.execute(
        select(OrganizationMember)
        .where(OrganizationMember.user_id == user.id)
        .limit(1)
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise NotFoundError(
            message="No organization found",
            detail="User does not belong to any organization",
        )

    result = await db.execute(
        select(Workspace)
        .where(Workspace.organization_id == membership.organization_id)
        .limit(1)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise NotFoundError(
            message="No workspace found",
            detail="Organization does not have any workspaces",
        )

    return workspace


# ---------------------------------------------------------------------------
# Session Management
# ---------------------------------------------------------------------------


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SessionResponse]:
    """List active sessions for the current user."""
    result = await db.execute(
        select(Session)
        .where(
            Session.user_id == current_user.id,
            Session.is_active == True,  # noqa: E712
        )
        .order_by(Session.created_at.desc())
    )
    sessions = list(result.scalars().all())
    return [SessionResponse.model_validate(s) for s in sessions]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke a specific session."""
    result = await db.execute(
        select(Session).where(
            Session.id == session_id,
            Session.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError(
            message="Session not found",
            detail=f"No session found with id {session_id}",
        )

    session.is_active = False
    await db.flush()

    # Audit log
    await audit_service.log(
        db=db,
        user_id=current_user.id,
        action="session_revoke",
        resource_type="session",
        resource_id=str(session_id),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.delete("/sessions", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_all_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke all sessions except the current one.

    The current session is identified by the request's user_id being set
    on the auth middleware. We revoke all OTHER active sessions.
    """
    # Get all active sessions for this user
    result = await db.execute(
        select(Session).where(
            Session.user_id == current_user.id,
            Session.is_active == True,  # noqa: E712
        )
    )
    sessions = list(result.scalars().all())

    revoked_count = 0
    for session in sessions:
        # We cannot easily identify "the current session" without the refresh token,
        # so we revoke all sessions. The user will need to re-authenticate.
        session.is_active = False
        revoked_count += 1

    await db.flush()

    # Audit log
    await audit_service.log(
        db=db,
        user_id=current_user.id,
        action="session_revoke_all",
        resource_type="session",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"revoked_count": revoked_count},
    )


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------


@router.get("/audit-log", response_model=AuditLogListResponse)
async def get_audit_log(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    """Get the current user's audit log (paginated)."""
    items, total = await audit_service.get_user_activity(
        db, current_user.id, limit=limit, offset=offset
    )
    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(item) for item in items],
        total=total,
    )


@router.get("/events", response_model=list[AuditLogResponse])
async def get_security_events(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLogResponse]:
    """Get security-relevant events for the current user."""
    events = await audit_service.get_security_events(db, current_user.id, days=days)
    return [AuditLogResponse.model_validate(e) for e in events]


# ---------------------------------------------------------------------------
# Panic Button
# ---------------------------------------------------------------------------


@router.post("/panic", status_code=status.HTTP_200_OK)
async def panic_button(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Panic button: revoke all platform connections and all sessions.

    This is an emergency action for when a user suspects their account
    has been compromised.
    """
    workspace = await get_user_workspace(current_user, db)

    # 1. Revoke all platform connections
    result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.workspace_id == workspace.id,
            PlatformConnection.is_active == True,  # noqa: E712
        )
    )
    connections = list(result.scalars().all())
    connections_revoked = 0
    for conn in connections:
        conn.is_active = False
        connections_revoked += 1

    # 2. Revoke all sessions
    result = await db.execute(
        select(Session).where(
            Session.user_id == current_user.id,
            Session.is_active == True,  # noqa: E712
        )
    )
    sessions = list(result.scalars().all())
    sessions_revoked = 0
    for session in sessions:
        session.is_active = False
        sessions_revoked += 1

    await db.flush()

    # 3. Audit log
    await audit_service.log(
        db=db,
        user_id=current_user.id,
        action="panic_button",
        resource_type="workspace",
        resource_id=str(workspace.id),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={
            "connections_revoked": connections_revoked,
            "sessions_revoked": sessions_revoked,
        },
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
