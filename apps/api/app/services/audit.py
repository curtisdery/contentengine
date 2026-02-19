"""Enhanced audit logging service — structured event tracking for compliance and security."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

# Security-relevant action types
SECURITY_ACTIONS = {
    "login",
    "failed_login",
    "password_change",
    "mfa_toggle",
    "session_revoke",
    "session_revoke_all",
    "platform_connect",
    "platform_disconnect",
    "autopilot_enable",
    "autopilot_disable",
    "panic_button",
    "api_key_create",
    "api_key_revoke",
}


class AuditService:
    """Handles audit log creation, querying, and security event filtering."""

    async def log(
        self,
        db: AsyncSession,
        user_id: UUID | None,
        action: str,
        resource_type: str | None = None,
        resource_id: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        metadata: dict | None = None,
    ) -> AuditLog:
        """Create an audit log entry."""
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata,
        )
        db.add(entry)
        await db.flush()
        await db.refresh(entry)
        return entry

    async def get_user_activity(
        self,
        db: AsyncSession,
        user_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[AuditLog], int]:
        """Get paginated audit log for a user."""
        # Count total
        count_result = await db.execute(
            select(func.count(AuditLog.id)).where(AuditLog.user_id == user_id)
        )
        total = count_result.scalar_one()

        # Fetch page
        result = await db.execute(
            select(AuditLog)
            .where(AuditLog.user_id == user_id)
            .order_by(AuditLog.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        items = list(result.scalars().all())

        return items, total

    async def get_workspace_activity(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        limit: int = 50,
        offset: int = 0,
        action_filter: str | None = None,
    ) -> tuple[list[AuditLog], int]:
        """Get paginated audit log for a workspace.

        Filters by resource_type='workspace' and resource_id=workspace_id,
        or by metadata containing workspace_id.
        """
        base_filter = or_(
            AuditLog.resource_id == str(workspace_id),
        )

        count_query = select(func.count(AuditLog.id)).where(base_filter)
        fetch_query = (
            select(AuditLog)
            .where(base_filter)
            .order_by(AuditLog.created_at.desc())
            .offset(offset)
            .limit(limit)
        )

        if action_filter:
            count_query = count_query.where(AuditLog.action == action_filter)
            fetch_query = fetch_query.where(AuditLog.action == action_filter)

        count_result = await db.execute(count_query)
        total = count_result.scalar_one()

        result = await db.execute(fetch_query)
        items = list(result.scalars().all())

        return items, total

    async def get_security_events(
        self,
        db: AsyncSession,
        user_id: UUID,
        days: int = 30,
    ) -> list[AuditLog]:
        """Get security-relevant events for a user within the specified timeframe."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        result = await db.execute(
            select(AuditLog)
            .where(
                AuditLog.user_id == user_id,
                AuditLog.action.in_(SECURITY_ACTIONS),
                AuditLog.created_at >= cutoff,
            )
            .order_by(AuditLog.created_at.desc())
        )
        return list(result.scalars().all())
