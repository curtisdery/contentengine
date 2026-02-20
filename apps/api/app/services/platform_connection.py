"""Platform connection service — manage OAuth connections to external platforms."""

import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform_connection import PlatformConnection
from app.platforms.profiles import get_platform
from app.utils.encryption import encrypt_token, decrypt_token
from app.utils.exceptions import NotFoundError, ValidationError

logger = logging.getLogger(__name__)


class PlatformConnectionService:
    """Manages platform OAuth connections for workspaces."""

    async def connect_platform(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        platform_id: str,
        oauth_data: dict,
        already_encrypted: bool = False,
    ) -> PlatformConnection:
        """Store a new platform connection after OAuth flow.

        oauth_data should include:
            - platform_user_id (str, optional)
            - platform_username (str, optional)
            - access_token (str)
            - refresh_token (str, optional)
            - token_expires_at (datetime, optional)
            - scopes (list[str], optional)

        If already_encrypted is True, tokens are stored as-is (caller already
        encrypted them). Otherwise they are encrypted before storage.
        """
        # Validate the platform_id exists
        profile = get_platform(platform_id)
        if not profile:
            raise ValidationError(
                message="Invalid platform",
                detail=f"Platform '{platform_id}' is not a recognized platform.",
            )

        # Encrypt tokens if not already done
        access_tok = oauth_data.get("access_token")
        refresh_tok = oauth_data.get("refresh_token")
        if not already_encrypted:
            access_tok = encrypt_token(access_tok) if access_tok else None
            refresh_tok = encrypt_token(refresh_tok) if refresh_tok else None

        # Check for existing active connection
        existing = await self.get_connection(db, workspace_id, platform_id)
        if existing and existing.is_active:
            # Update the existing connection tokens
            existing.access_token_encrypted = access_tok
            existing.refresh_token_encrypted = refresh_tok
            existing.token_expires_at = oauth_data.get("token_expires_at")
            existing.platform_user_id = oauth_data.get("platform_user_id", existing.platform_user_id)
            existing.platform_username = oauth_data.get("platform_username", existing.platform_username)
            existing.scopes = oauth_data.get("scopes", existing.scopes or [])
            existing.is_active = True

            await db.flush()
            await db.refresh(existing)
            logger.info("Updated platform connection for %s in workspace %s", platform_id, workspace_id)
            return existing

        connection = PlatformConnection(
            workspace_id=workspace_id,
            platform_id=platform_id,
            platform_user_id=oauth_data.get("platform_user_id"),
            platform_username=oauth_data.get("platform_username"),
            access_token_encrypted=access_tok,
            refresh_token_encrypted=refresh_tok,
            token_expires_at=oauth_data.get("token_expires_at"),
            scopes=oauth_data.get("scopes", []),
            is_active=True,
        )
        db.add(connection)
        await db.flush()
        await db.refresh(connection)

        logger.info("Created platform connection for %s in workspace %s", platform_id, workspace_id)
        return connection

    async def get_connections(
        self,
        db: AsyncSession,
        workspace_id: UUID,
    ) -> list[PlatformConnection]:
        """List all platform connections for a workspace."""
        result = await db.execute(
            select(PlatformConnection)
            .where(PlatformConnection.workspace_id == workspace_id)
            .order_by(PlatformConnection.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_connection(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        platform_id: str,
    ) -> PlatformConnection | None:
        """Get the active connection for a specific platform in a workspace."""
        result = await db.execute(
            select(PlatformConnection).where(
                PlatformConnection.workspace_id == workspace_id,
                PlatformConnection.platform_id == platform_id,
                PlatformConnection.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def disconnect_platform(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        connection_id: UUID,
    ) -> None:
        """Remove a platform connection (soft-delete by setting is_active=False)."""
        result = await db.execute(
            select(PlatformConnection).where(
                PlatformConnection.id == connection_id,
                PlatformConnection.workspace_id == workspace_id,
            )
        )
        connection = result.scalar_one_or_none()
        if not connection:
            raise NotFoundError(
                message="Connection not found",
                detail=f"No platform connection found with id {connection_id}",
            )

        connection.is_active = False
        await db.flush()

        logger.info(
            "Disconnected platform %s (connection %s) in workspace %s",
            connection.platform_id,
            connection_id,
            workspace_id,
        )

    async def update_tokens(
        self,
        db: AsyncSession,
        connection_id: UUID,
        access_token: str,
        refresh_token: str | None,
        expires_at: datetime | None,
    ) -> PlatformConnection:
        """Update OAuth tokens after a token refresh."""
        result = await db.execute(
            select(PlatformConnection).where(PlatformConnection.id == connection_id)
        )
        connection = result.scalar_one_or_none()
        if not connection:
            raise NotFoundError(
                message="Connection not found",
                detail=f"No platform connection found with id {connection_id}",
            )

        connection.access_token_encrypted = encrypt_token(access_token)
        if refresh_token is not None:
            connection.refresh_token_encrypted = encrypt_token(refresh_token)
        if expires_at is not None:
            connection.token_expires_at = expires_at

        await db.flush()
        await db.refresh(connection)

        logger.info("Updated tokens for connection %s", connection_id)
        return connection

    @staticmethod
    def get_decrypted_tokens(connection: PlatformConnection) -> dict:
        """Decrypt and return tokens for a connection (for use by publishers)."""
        return {
            "access_token": (
                decrypt_token(connection.access_token_encrypted)
                if connection.access_token_encrypted
                else None
            ),
            "refresh_token": (
                decrypt_token(connection.refresh_token_encrypted)
                if connection.refresh_token_encrypted
                else None
            ),
        }

    async def get_connection_status(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        platform_id: str,
    ) -> dict:
        """Check connection status for a specific platform.

        Returns a dict with:
            - connected: bool
            - platform_id: str
            - platform_username: str | None
            - token_expired: bool
            - is_active: bool
        """
        connection = await self.get_connection(db, workspace_id, platform_id)

        if not connection:
            return {
                "connected": False,
                "platform_id": platform_id,
                "platform_username": None,
                "token_expired": False,
                "is_active": False,
            }

        token_expired = False
        if connection.token_expires_at:
            token_expired = connection.token_expires_at < datetime.utcnow()

        return {
            "connected": True,
            "platform_id": platform_id,
            "platform_username": connection.platform_username,
            "token_expired": token_expired,
            "is_active": connection.is_active,
        }
