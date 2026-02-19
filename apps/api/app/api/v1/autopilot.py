"""Autopilot configuration and trust-based auto-publishing API routes."""

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.organization import OrganizationMember, Workspace
from app.models.user import User
from app.schemas.autopilot import (
    AutopilotConfigResponse,
    AutopilotEligibilityResponse,
    AutopilotSummaryResponse,
    EnableAutopilotRequest,
    RecordReviewRequest,
    UpdateThresholdsRequest,
)
from app.services.autopilot import AutopilotService
from app.utils.exceptions import NotFoundError

router = APIRouter()
autopilot_service = AutopilotService()


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


@router.get("/summary", response_model=AutopilotSummaryResponse)
async def get_autopilot_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AutopilotSummaryResponse:
    """Autopilot summary across all platforms."""
    workspace = await get_user_workspace(current_user, db)
    data = await autopilot_service.get_autopilot_summary(db, workspace.id)
    return AutopilotSummaryResponse(**data)


@router.get(
    "/config/{platform_id}",
    response_model=AutopilotConfigResponse,
)
async def get_autopilot_config(
    platform_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AutopilotConfigResponse:
    """Get autopilot config for a specific platform."""
    workspace = await get_user_workspace(current_user, db)
    config = await autopilot_service.get_config(db, workspace.id, platform_id)
    return AutopilotConfigResponse.model_validate(config)


@router.get(
    "/eligibility/{platform_id}",
    response_model=AutopilotEligibilityResponse,
)
async def check_eligibility(
    platform_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AutopilotEligibilityResponse:
    """Check if a platform is eligible for autopilot."""
    workspace = await get_user_workspace(current_user, db)
    data = await autopilot_service.check_eligibility(db, workspace.id, platform_id)
    return AutopilotEligibilityResponse(**data)


@router.post(
    "/enable",
    response_model=AutopilotConfigResponse,
    status_code=status.HTTP_200_OK,
)
async def enable_autopilot(
    request_body: EnableAutopilotRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AutopilotConfigResponse:
    """Enable autopilot for a platform."""
    workspace = await get_user_workspace(current_user, db)
    config = await autopilot_service.enable_autopilot(
        db, workspace.id, request_body.platform_id
    )
    return AutopilotConfigResponse.model_validate(config)


@router.post(
    "/disable/{platform_id}",
    response_model=AutopilotConfigResponse,
)
async def disable_autopilot(
    platform_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AutopilotConfigResponse:
    """Disable autopilot for a platform."""
    workspace = await get_user_workspace(current_user, db)
    config = await autopilot_service.disable_autopilot(db, workspace.id, platform_id)
    return AutopilotConfigResponse.model_validate(config)


@router.patch(
    "/thresholds/{platform_id}",
    response_model=AutopilotConfigResponse,
)
async def update_thresholds(
    platform_id: str,
    request_body: UpdateThresholdsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AutopilotConfigResponse:
    """Update autopilot thresholds for a platform."""
    workspace = await get_user_workspace(current_user, db)
    config = await autopilot_service.update_thresholds(
        db,
        workspace.id,
        platform_id,
        required_rate=request_body.required_approval_rate,
        minimum_reviews=request_body.required_minimum_reviews,
    )
    return AutopilotConfigResponse.model_validate(config)


@router.post(
    "/record-review",
    response_model=AutopilotConfigResponse,
)
async def record_review(
    request_body: RecordReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AutopilotConfigResponse:
    """Record a content review (updates trust metrics)."""
    workspace = await get_user_workspace(current_user, db)
    config = await autopilot_service.record_review(
        db, workspace.id, request_body.platform_id, request_body.was_edited
    )
    return AutopilotConfigResponse.model_validate(config)


@router.post("/process-queue")
async def process_autopilot_queue(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Process the autopilot queue — auto-schedule approved outputs for enabled platforms."""
    workspace = await get_user_workspace(current_user, db)
    scheduled = await autopilot_service.process_autopilot_queue(db, workspace.id)
    return {
        "auto_scheduled": scheduled,
        "count": len(scheduled),
    }
