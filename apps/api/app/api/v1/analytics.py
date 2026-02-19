"""Analytics dashboard and Multiplier Score API routes."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.content import ContentUpload, GeneratedOutput
from app.models.organization import OrganizationMember, Workspace
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsDashboardResponse,
    AnalyticsSnapshotResponse,
    AudienceIntelligenceResponse,
    ContentStrategySuggestion,
    ContentTypePerformanceResponse,
    HookPerformanceResponse,
    MultiplierScoreResponse,
    PlatformPerformanceResponse,
    RecordSnapshotRequest,
    TimeHeatmapEntry,
)
from app.services.analytics import AnalyticsService
from app.utils.exceptions import NotFoundError

router = APIRouter()
analytics_service = AnalyticsService()


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
# Dashboard
# ---------------------------------------------------------------------------


@router.get("/dashboard", response_model=AnalyticsDashboardResponse)
async def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsDashboardResponse:
    """Main analytics dashboard overview."""
    workspace = await get_user_workspace(current_user, db)
    data = await analytics_service.get_dashboard_overview(db, workspace.id)
    return AnalyticsDashboardResponse(**data)


# ---------------------------------------------------------------------------
# Multiplier Scores
# ---------------------------------------------------------------------------


@router.get(
    "/multiplier-scores",
    response_model=list[MultiplierScoreResponse],
)
async def list_multiplier_scores(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MultiplierScoreResponse]:
    """Get all multiplier scores for the workspace."""
    workspace = await get_user_workspace(current_user, db)
    scores = await analytics_service.get_workspace_multiplier_scores(db, workspace.id)
    return [MultiplierScoreResponse.model_validate(s) for s in scores]


@router.get(
    "/multiplier-scores/{content_id}",
    response_model=MultiplierScoreResponse,
)
async def get_multiplier_score(
    content_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MultiplierScoreResponse:
    """Get the multiplier score for a single content piece."""
    workspace = await get_user_workspace(current_user, db)

    # Verify the content belongs to this workspace
    result = await db.execute(
        select(ContentUpload).where(
            ContentUpload.id == content_id,
            ContentUpload.workspace_id == workspace.id,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundError(
            message="Content not found",
            detail=f"No content upload found with id {content_id}",
        )

    score = await analytics_service.get_multiplier_score(db, content_id)
    if not score:
        raise NotFoundError(
            message="Multiplier score not found",
            detail=f"No multiplier score calculated yet for content {content_id}",
        )
    return MultiplierScoreResponse.model_validate(score)


@router.post(
    "/multiplier-scores/{content_id}/calculate",
    response_model=MultiplierScoreResponse,
    status_code=status.HTTP_200_OK,
)
async def calculate_multiplier_score(
    content_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MultiplierScoreResponse:
    """Recalculate the multiplier score for a content piece."""
    workspace = await get_user_workspace(current_user, db)

    # Verify the content belongs to this workspace
    result = await db.execute(
        select(ContentUpload).where(
            ContentUpload.id == content_id,
            ContentUpload.workspace_id == workspace.id,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundError(
            message="Content not found",
            detail=f"No content upload found with id {content_id}",
        )

    score = await analytics_service.calculate_multiplier_score(
        db, content_id, workspace.id
    )
    return MultiplierScoreResponse.model_validate(score)


# ---------------------------------------------------------------------------
# Performance Insights
# ---------------------------------------------------------------------------


@router.get(
    "/platform-performance",
    response_model=list[PlatformPerformanceResponse],
)
async def get_platform_performance(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlatformPerformanceResponse]:
    """Per-platform performance breakdown."""
    workspace = await get_user_workspace(current_user, db)
    data = await analytics_service.get_platform_performance(db, workspace.id, days)
    return [PlatformPerformanceResponse(**item) for item in data]


@router.get(
    "/content-types",
    response_model=list[ContentTypePerformanceResponse],
)
async def get_content_type_performance(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ContentTypePerformanceResponse]:
    """Content type performance breakdown."""
    workspace = await get_user_workspace(current_user, db)
    data = await analytics_service.get_content_type_performance(db, workspace.id, days)
    return [ContentTypePerformanceResponse(**item) for item in data]


@router.get(
    "/hook-performance",
    response_model=list[HookPerformanceResponse],
)
async def get_hook_performance(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HookPerformanceResponse]:
    """Hook type performance breakdown."""
    workspace = await get_user_workspace(current_user, db)
    data = await analytics_service.get_hook_performance(db, workspace.id, days)
    return [HookPerformanceResponse(**item) for item in data]


@router.get(
    "/time-heatmap",
    response_model=list[TimeHeatmapEntry],
)
async def get_time_heatmap(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TimeHeatmapEntry]:
    """Day/hour engagement heatmap data."""
    workspace = await get_user_workspace(current_user, db)
    data = await analytics_service.get_time_of_day_performance(db, workspace.id, days)
    return [TimeHeatmapEntry(**item) for item in data]


@router.get(
    "/audience-intelligence",
    response_model=AudienceIntelligenceResponse,
)
async def get_audience_intelligence(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AudienceIntelligenceResponse:
    """Audience insights across platforms."""
    workspace = await get_user_workspace(current_user, db)
    data = await analytics_service.get_audience_intelligence(db, workspace.id)
    return AudienceIntelligenceResponse(**data)


@router.get(
    "/strategy-suggestions",
    response_model=list[ContentStrategySuggestion],
)
async def get_strategy_suggestions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ContentStrategySuggestion]:
    """Data-driven content strategy suggestions."""
    workspace = await get_user_workspace(current_user, db)
    data = await analytics_service.get_content_strategy_suggestions(db, workspace.id)
    return [ContentStrategySuggestion(**item) for item in data]


# ---------------------------------------------------------------------------
# Snapshots
# ---------------------------------------------------------------------------


@router.post(
    "/snapshots",
    response_model=AnalyticsSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
)
async def record_snapshot(
    request_body: RecordSnapshotRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsSnapshotResponse:
    """Record an analytics snapshot for a published output (for webhook/polling)."""
    workspace = await get_user_workspace(current_user, db)

    # Verify the output belongs to this workspace
    result = await db.execute(
        select(GeneratedOutput)
        .join(ContentUpload, ContentUpload.id == GeneratedOutput.content_upload_id)
        .where(
            GeneratedOutput.id == request_body.output_id,
            ContentUpload.workspace_id == workspace.id,
        )
    )
    output = result.scalar_one_or_none()
    if not output:
        raise NotFoundError(
            message="Output not found",
            detail=f"No generated output found with id {request_body.output_id}",
        )

    metrics = {
        "impressions": request_body.impressions,
        "engagements": request_body.engagements,
        "engagement_rate": request_body.engagement_rate,
        "saves_bookmarks": request_body.saves_bookmarks,
        "shares_reposts": request_body.shares_reposts,
        "comments": request_body.comments,
        "clicks": request_body.clicks,
        "follows_gained": request_body.follows_gained,
        "platform_specific": request_body.platform_specific,
    }

    snapshot = await analytics_service.record_snapshot(
        db, request_body.output_id, workspace.id, metrics
    )
    return AnalyticsSnapshotResponse.model_validate(snapshot)


@router.get(
    "/snapshots/{output_id}",
    response_model=list[AnalyticsSnapshotResponse],
)
async def get_snapshot_history(
    output_id: UUID,
    start: datetime | None = Query(None, description="Start of date range (ISO 8601)"),
    end: datetime | None = Query(None, description="End of date range (ISO 8601)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AnalyticsSnapshotResponse]:
    """Get snapshot history for an output."""
    workspace = await get_user_workspace(current_user, db)

    # Verify the output belongs to this workspace
    result = await db.execute(
        select(GeneratedOutput)
        .join(ContentUpload, ContentUpload.id == GeneratedOutput.content_upload_id)
        .where(
            GeneratedOutput.id == output_id,
            ContentUpload.workspace_id == workspace.id,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundError(
            message="Output not found",
            detail=f"No generated output found with id {output_id}",
        )

    # Default to last 30 days if no range specified
    if not start:
        start = datetime.now(timezone.utc) - timedelta(days=30)
    if not end:
        end = datetime.now(timezone.utc)

    snapshots = await analytics_service.get_snapshots_timeseries(
        db, output_id, start, end
    )
    return [AnalyticsSnapshotResponse.model_validate(s) for s in snapshots]
