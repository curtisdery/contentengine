"""Platform connection management API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.organization import OrganizationMember, Workspace
from app.models.user import User
from app.schemas.calendar import (
    ConnectPlatformRequest,
    PlatformConnectionResponse,
    PlatformConnectionStatusResponse,
)
from app.services.platform_connection import PlatformConnectionService
from app.utils.exceptions import NotFoundError

router = APIRouter()
connection_service = PlatformConnectionService()


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


@router.get("", response_model=list[PlatformConnectionResponse])
async def list_connections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlatformConnectionResponse]:
    """List all platform connections for the current workspace."""
    workspace = await get_user_workspace(current_user, db)

    connections = await connection_service.get_connections(
        db=db,
        workspace_id=workspace.id,
    )

    return [PlatformConnectionResponse.model_validate(conn) for conn in connections]


@router.post(
    "/{platform_id}/connect",
    response_model=PlatformConnectionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def connect_platform(
    platform_id: str,
    request_body: ConnectPlatformRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlatformConnectionResponse:
    """Store OAuth connection data for a platform.

    This endpoint is called after the frontend completes the OAuth flow
    and has the access/refresh tokens to store.
    """
    workspace = await get_user_workspace(current_user, db)

    oauth_data = {
        "platform_user_id": request_body.platform_user_id,
        "platform_username": request_body.platform_username,
        "access_token": request_body.access_token,
        "refresh_token": request_body.refresh_token,
        "token_expires_at": request_body.token_expires_at,
        "scopes": request_body.scopes,
    }

    connection = await connection_service.connect_platform(
        db=db,
        workspace_id=workspace.id,
        platform_id=platform_id,
        oauth_data=oauth_data,
    )

    return PlatformConnectionResponse.model_validate(connection)


@router.delete(
    "/{connection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def disconnect_platform(
    connection_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Disconnect a platform (soft-delete the connection)."""
    workspace = await get_user_workspace(current_user, db)

    await connection_service.disconnect_platform(
        db=db,
        workspace_id=workspace.id,
        connection_id=connection_id,
    )


@router.get(
    "/{platform_id}/status",
    response_model=PlatformConnectionStatusResponse,
)
async def get_connection_status(
    platform_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlatformConnectionStatusResponse:
    """Check the connection status for a specific platform."""
    workspace = await get_user_workspace(current_user, db)

    status_data = await connection_service.get_connection_status(
        db=db,
        workspace_id=workspace.id,
        platform_id=platform_id,
    )

    return PlatformConnectionStatusResponse(**status_data)
