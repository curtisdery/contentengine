"""Calendar and scheduling API routes."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.calendar import ScheduledEvent
from app.models.content import ContentUpload, GeneratedOutput
from app.models.organization import OrganizationMember, Workspace
from app.models.platform_connection import PlatformConnection
from app.models.user import User
from app.schemas.calendar import (
    AutoScheduleRequest,
    CalendarEventsResponse,
    CalendarStatsResponse,
    ContentGapResponse,
    PublishNowResponse,
    RescheduleRequest,
    ScheduleBatchRequest,
    ScheduledEventResponse,
    ScheduleOutputRequest,
)
from app.services.publisher import PublisherRegistry
from app.services.scheduler import SchedulerService
from app.utils.exceptions import NotFoundError, ValidationError

router = APIRouter()
scheduler_service = SchedulerService()


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
# Helpers
# ---------------------------------------------------------------------------


async def _enrich_event_response(
    db: AsyncSession, event: ScheduledEvent
) -> ScheduledEventResponse:
    """Build a ScheduledEventResponse with nested output and content info."""
    resp = ScheduledEventResponse.model_validate(event)

    # Load the generated output for nested fields
    output_result = await db.execute(
        select(GeneratedOutput).where(GeneratedOutput.id == event.generated_output_id)
    )
    output = output_result.scalar_one_or_none()
    if output:
        resp.output_content = output.content
        resp.output_format_name = output.format_name

        # Load the content upload title
        cu_result = await db.execute(
            select(ContentUpload).where(ContentUpload.id == output.content_upload_id)
        )
        content_upload = cu_result.scalar_one_or_none()
        if content_upload:
            resp.content_title = content_upload.title

    return resp


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/events", response_model=CalendarEventsResponse)
async def get_calendar_events(
    start: datetime = Query(..., description="Start of date range (ISO 8601)"),
    end: datetime = Query(..., description="End of date range (ISO 8601)"),
    platform_id: str | None = Query(None, description="Filter by platform ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CalendarEventsResponse:
    """Get all scheduled events in a date range, optionally filtered by platform."""
    workspace = await get_user_workspace(current_user, db)

    events = await scheduler_service.get_calendar_events(
        db=db,
        workspace_id=workspace.id,
        start=start,
        end=end,
        platform_id=platform_id,
    )

    enriched = [await _enrich_event_response(db, event) for event in events]
    return CalendarEventsResponse(events=enriched, total=len(enriched))


@router.get("/stats", response_model=CalendarStatsResponse)
async def get_calendar_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CalendarStatsResponse:
    """Get calendar overview statistics including content gaps."""
    workspace = await get_user_workspace(current_user, db)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    week_end = today_start + timedelta(days=7)

    # Count scheduled events
    scheduled_count = await db.execute(
        select(func.count(ScheduledEvent.id)).where(
            ScheduledEvent.workspace_id == workspace.id,
            ScheduledEvent.status == "scheduled",
        )
    )
    total_scheduled = scheduled_count.scalar_one()

    # Count published events
    published_count = await db.execute(
        select(func.count(ScheduledEvent.id)).where(
            ScheduledEvent.workspace_id == workspace.id,
            ScheduledEvent.status == "published",
        )
    )
    total_published = published_count.scalar_one()

    # Count failed events
    failed_count = await db.execute(
        select(func.count(ScheduledEvent.id)).where(
            ScheduledEvent.workspace_id == workspace.id,
            ScheduledEvent.status == "failed",
        )
    )
    total_failed = failed_count.scalar_one()

    # Upcoming today
    today_count = await db.execute(
        select(func.count(ScheduledEvent.id)).where(
            ScheduledEvent.workspace_id == workspace.id,
            ScheduledEvent.status == "scheduled",
            ScheduledEvent.scheduled_at >= today_start,
            ScheduledEvent.scheduled_at < today_end,
        )
    )
    upcoming_today = today_count.scalar_one()

    # Upcoming this week
    week_count = await db.execute(
        select(func.count(ScheduledEvent.id)).where(
            ScheduledEvent.workspace_id == workspace.id,
            ScheduledEvent.status == "scheduled",
            ScheduledEvent.scheduled_at >= today_start,
            ScheduledEvent.scheduled_at < week_end,
        )
    )
    upcoming_this_week = week_count.scalar_one()

    # Active platforms (distinct platform_ids with scheduled or published events)
    platforms_result = await db.execute(
        select(func.count(func.distinct(ScheduledEvent.platform_id))).where(
            ScheduledEvent.workspace_id == workspace.id,
            ScheduledEvent.status.in_(["scheduled", "published"]),
        )
    )
    platforms_active = platforms_result.scalar_one()

    # Content gaps
    gaps = await scheduler_service.detect_content_gaps(db=db, workspace_id=workspace.id)
    content_gaps = [ContentGapResponse(**gap) for gap in gaps]

    return CalendarStatsResponse(
        total_scheduled=total_scheduled,
        total_published=total_published,
        total_failed=total_failed,
        upcoming_today=upcoming_today,
        upcoming_this_week=upcoming_this_week,
        platforms_active=platforms_active,
        content_gaps=content_gaps,
    )


@router.get("/upcoming", response_model=CalendarEventsResponse)
async def get_upcoming_events(
    limit: int = Query(20, ge=1, le=100, description="Number of upcoming events to return"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CalendarEventsResponse:
    """Get the next N upcoming scheduled events."""
    workspace = await get_user_workspace(current_user, db)

    events = await scheduler_service.get_upcoming(
        db=db,
        workspace_id=workspace.id,
        limit=limit,
    )

    enriched = [await _enrich_event_response(db, event) for event in events]
    return CalendarEventsResponse(events=enriched, total=len(enriched))


@router.post(
    "/schedule",
    response_model=ScheduledEventResponse,
    status_code=status.HTTP_201_CREATED,
)
async def schedule_output(
    request_body: ScheduleOutputRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScheduledEventResponse:
    """Schedule a single output for publishing."""
    workspace = await get_user_workspace(current_user, db)

    # Verify the output belongs to this workspace
    output_result = await db.execute(
        select(GeneratedOutput).where(GeneratedOutput.id == request_body.output_id)
    )
    output = output_result.scalar_one_or_none()
    if not output:
        raise NotFoundError(
            message="Output not found",
            detail=f"No generated output found with id {request_body.output_id}",
        )

    cu_result = await db.execute(
        select(ContentUpload).where(
            ContentUpload.id == output.content_upload_id,
            ContentUpload.workspace_id == workspace.id,
        )
    )
    if not cu_result.scalar_one_or_none():
        raise NotFoundError(
            message="Output not found",
            detail=f"No generated output found with id {request_body.output_id}",
        )

    event = await scheduler_service.schedule_output(
        db=db,
        workspace_id=workspace.id,
        output_id=request_body.output_id,
        scheduled_at=request_body.scheduled_at,
        priority=1,  # Manual schedule = highest priority
    )

    return await _enrich_event_response(db, event)


@router.post(
    "/schedule-batch",
    response_model=CalendarEventsResponse,
    status_code=status.HTTP_201_CREATED,
)
async def schedule_batch(
    request_body: ScheduleBatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CalendarEventsResponse:
    """Schedule multiple outputs at once."""
    workspace = await get_user_workspace(current_user, db)

    items = [
        {
            "output_id": item.output_id,
            "scheduled_at": item.scheduled_at,
            "priority": 1,
        }
        for item in request_body.items
    ]

    events = await scheduler_service.schedule_batch(
        db=db,
        workspace_id=workspace.id,
        schedule_items=items,
    )

    enriched = [await _enrich_event_response(db, event) for event in events]
    return CalendarEventsResponse(events=enriched, total=len(enriched))


@router.post(
    "/auto-schedule",
    response_model=CalendarEventsResponse,
    status_code=status.HTTP_201_CREATED,
)
async def auto_schedule(
    request_body: AutoScheduleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CalendarEventsResponse:
    """Auto-schedule all approved outputs for a content piece using the distribution arc.

    1. Loads the content upload and its approved outputs.
    2. Creates a distribution arc starting from the requested date.
    3. Batch-schedules all outputs.
    """
    workspace = await get_user_workspace(current_user, db)

    # Load content upload
    result = await db.execute(
        select(ContentUpload).where(
            ContentUpload.id == request_body.content_id,
            ContentUpload.workspace_id == workspace.id,
        )
    )
    content_upload = result.scalar_one_or_none()
    if not content_upload:
        raise NotFoundError(
            message="Content not found",
            detail=f"No content upload found with id {request_body.content_id}",
        )

    # Get approved outputs
    outputs_result = await db.execute(
        select(GeneratedOutput).where(
            GeneratedOutput.content_upload_id == content_upload.id,
            GeneratedOutput.status == "approved",
        )
    )
    outputs = list(outputs_result.scalars().all())

    if not outputs:
        raise ValidationError(
            message="No approved outputs",
            detail="No approved outputs found for this content piece. Approve outputs before auto-scheduling.",
        )

    # Create distribution arc
    arc_items = scheduler_service.create_distribution_arc(
        outputs=outputs,
        start_date=request_body.start_date,
    )

    # Schedule the batch
    events = await scheduler_service.schedule_batch(
        db=db,
        workspace_id=workspace.id,
        schedule_items=arc_items,
    )

    enriched = [await _enrich_event_response(db, event) for event in events]
    return CalendarEventsResponse(events=enriched, total=len(enriched))


@router.patch(
    "/events/{event_id}/reschedule",
    response_model=ScheduledEventResponse,
)
async def reschedule_event(
    event_id: UUID,
    request_body: RescheduleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScheduledEventResponse:
    """Reschedule an event to a new time (e.g. drag-and-drop on calendar)."""
    workspace = await get_user_workspace(current_user, db)

    event = await scheduler_service.reschedule(
        db=db,
        event_id=event_id,
        workspace_id=workspace.id,
        new_datetime=request_body.scheduled_at,
    )

    return await _enrich_event_response(db, event)


@router.delete(
    "/events/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_event(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Cancel a scheduled event."""
    workspace = await get_user_workspace(current_user, db)

    await scheduler_service.cancel_scheduled(
        db=db,
        event_id=event_id,
        workspace_id=workspace.id,
    )


@router.post(
    "/events/{event_id}/publish-now",
    response_model=PublishNowResponse,
)
async def publish_now(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PublishNowResponse:
    """Manually trigger an immediate publish attempt for a scheduled event.

    1. Loads the event and verifies ownership.
    2. Checks if a platform connection exists and is active.
    3. Gets the publisher from the registry.
    4. Attempts to publish.
    5. Updates the event status accordingly.
    """
    workspace = await get_user_workspace(current_user, db)

    # Load event
    event_result = await db.execute(
        select(ScheduledEvent).where(
            ScheduledEvent.id == event_id,
            ScheduledEvent.workspace_id == workspace.id,
        )
    )
    event = event_result.scalar_one_or_none()
    if not event:
        raise NotFoundError(
            message="Scheduled event not found",
            detail=f"No scheduled event found with id {event_id}",
        )

    if event.status not in ("scheduled", "failed"):
        raise ValidationError(
            message="Cannot publish",
            detail=f"Event is in '{event.status}' status. Only 'scheduled' or 'failed' events can be published.",
        )

    # Load the generated output
    output_result = await db.execute(
        select(GeneratedOutput).where(GeneratedOutput.id == event.generated_output_id)
    )
    output = output_result.scalar_one_or_none()
    if not output:
        raise NotFoundError(
            message="Output not found",
            detail="The generated output for this event no longer exists.",
        )

    # Mark as publishing
    event = await scheduler_service.mark_publishing(db=db, event_id=event_id)

    # Check for platform connection
    conn_result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.workspace_id == workspace.id,
            PlatformConnection.platform_id == event.platform_id,
            PlatformConnection.is_active == True,  # noqa: E712
        )
    )
    connection = conn_result.scalar_one_or_none()

    # Get publisher
    publisher = PublisherRegistry.get(event.platform_id)

    if not publisher:
        # No publisher registered for this platform
        publish_result = {
            "success": False,
            "post_id": None,
            "url": None,
            "error": f"No publisher available for platform '{event.platform_id}'.",
        }
        event = await scheduler_service.mark_failed(
            db=db, event_id=event_id, error=publish_result["error"]
        )
    elif not connection:
        # No connection for this platform
        publish_result = {
            "success": False,
            "post_id": None,
            "url": None,
            "error": f"No active connection for platform '{event.platform_id}'. Connect the platform first.",
        }
        event = await scheduler_service.mark_failed(
            db=db, event_id=event_id, error=publish_result["error"]
        )
    else:
        # Attempt to publish
        try:
            publish_result = await publisher.publish(
                content=output.content,
                metadata=output.metadata or {},
                connection=connection,
            )
        except Exception as e:
            publish_result = {
                "success": False,
                "post_id": None,
                "url": None,
                "error": f"Publisher error: {str(e)}",
            }

        if publish_result.get("success"):
            event = await scheduler_service.mark_published(
                db=db,
                event_id=event_id,
                platform_post_id=publish_result.get("post_id"),
            )
        else:
            event = await scheduler_service.mark_failed(
                db=db,
                event_id=event_id,
                error=publish_result.get("error", "Unknown publishing error"),
            )

    enriched = await _enrich_event_response(db, event)
    return PublishNowResponse(event=enriched, publish_result=publish_result)
