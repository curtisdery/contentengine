"""Calendar and scheduling API routes — Firestore-backed."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from app.core.firestore import get_db
from app.core.tasks import enqueue_task
from app.middleware.auth import get_current_user
from app.utils.exceptions import NotFoundError, ValidationError

router = APIRouter()


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class ScheduleRequest(BaseModel):
    output_id: str
    scheduled_at: datetime
    platform: str | None = None


class BulkScheduleRequest(BaseModel):
    items: list[ScheduleRequest]


class RescheduleRequest(BaseModel):
    scheduled_at: datetime


# ---------------------------------------------------------------------------
# POST /api/v1/calendar/schedule
# ---------------------------------------------------------------------------

@router.post("/schedule", status_code=status.HTTP_201_CREATED)
async def schedule_output(
    body: ScheduleRequest,
    current_user=Depends(get_current_user),
) -> dict:
    """Schedule a single output for publishing."""
    db = get_db()

    # Verify output exists and belongs to user
    output_doc = await db.collection("generated_outputs").document(body.output_id).get()
    if not output_doc.exists:
        raise NotFoundError(message="Output not found", detail=f"No output with id {body.output_id}")

    output = output_doc.to_dict()
    if output.get("user_id") != current_user.id:
        raise NotFoundError(message="Output not found", detail=f"No output with id {body.output_id}")

    platform = body.platform or output.get("platform", "")
    scheduled_at = body.scheduled_at
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

    # Check for existing scheduled post for this output
    existing_query = (
        db.collection("scheduled_posts")
        .where("output_id", "==", body.output_id)
        .where("status", "==", "scheduled")
        .limit(1)
    )
    existing = [doc async for doc in existing_query.stream()]
    if existing:
        raise ValidationError(
            message="Already scheduled",
            detail="This output already has an active scheduled post. Reschedule or cancel it first.",
        )

    # Create scheduled post
    post_data = {
        "user_id": current_user.id,
        "output_id": body.output_id,
        "platform": platform,
        "scheduled_at": scheduled_at,
        "status": "scheduled",
        "retry_count": 0,
        "max_retries": 3,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    ref = await db.collection("scheduled_posts").add(post_data)
    post_id = ref[1].id

    # Update output status
    await db.collection("generated_outputs").document(body.output_id).update({
        "status": "scheduled",
        "scheduled_at": scheduled_at,
        "updated_at": datetime.now(timezone.utc),
    })

    return {**post_data, "id": post_id}


# ---------------------------------------------------------------------------
# POST /api/v1/calendar/bulk-schedule
# ---------------------------------------------------------------------------

@router.post("/bulk-schedule", status_code=status.HTTP_201_CREATED)
async def bulk_schedule(
    body: BulkScheduleRequest,
    current_user=Depends(get_current_user),
) -> dict:
    """Schedule multiple outputs at once."""
    scheduled = []
    skipped = []

    for item in body.items:
        try:
            result = await schedule_output(
                body=item,
                current_user=current_user,
            )
            scheduled.append(result)
        except (NotFoundError, ValidationError) as exc:
            skipped.append({"output_id": item.output_id, "reason": exc.detail})

    return {"scheduled": scheduled, "skipped": skipped, "total": len(scheduled)}


# ---------------------------------------------------------------------------
# GET /api/v1/calendar?start=&end=
# ---------------------------------------------------------------------------

@router.get("")
async def get_calendar_events(
    start: datetime = Query(..., description="Start of date range (ISO 8601)"),
    end: datetime = Query(..., description="End of date range (ISO 8601)"),
    platform: str | None = Query(None, description="Filter by platform"),
    current_user=Depends(get_current_user),
) -> dict:
    """Get all scheduled posts in a date range."""
    db = get_db()

    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    query = (
        db.collection("scheduled_posts")
        .where("user_id", "==", current_user.id)
        .where("scheduled_at", ">=", start)
        .where("scheduled_at", "<=", end)
    )

    events = []
    async for doc in query.stream():
        data = doc.to_dict()
        if platform and data.get("platform") != platform:
            continue
        events.append({**data, "id": doc.id})

    events.sort(key=lambda e: e.get("scheduled_at", datetime.min.replace(tzinfo=timezone.utc)))
    return {"events": events, "total": len(events)}


# ---------------------------------------------------------------------------
# PATCH /api/v1/calendar/{post_id}
# ---------------------------------------------------------------------------

@router.patch("/{post_id}")
async def reschedule_post(
    post_id: str,
    body: RescheduleRequest,
    current_user=Depends(get_current_user),
) -> dict:
    """Reschedule a post to a new time."""
    db = get_db()

    doc = await db.collection("scheduled_posts").document(post_id).get()
    if not doc.exists:
        raise NotFoundError(message="Post not found", detail=f"No scheduled post with id {post_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="Post not found", detail=f"No scheduled post with id {post_id}")

    if data.get("status") not in ("scheduled", "failed"):
        raise ValidationError(
            message="Cannot reschedule",
            detail=f"Post is '{data['status']}'. Only scheduled or failed posts can be rescheduled.",
        )

    scheduled_at = body.scheduled_at
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    await db.collection("scheduled_posts").document(post_id).update({
        "scheduled_at": scheduled_at,
        "status": "scheduled",
        "publish_error": None,
        "updated_at": now,
    })

    # Update output scheduled_at
    output_id = data.get("output_id")
    if output_id:
        await db.collection("generated_outputs").document(output_id).update({
            "scheduled_at": scheduled_at,
            "updated_at": now,
        })

    return {**data, "id": post_id, "scheduled_at": scheduled_at, "status": "scheduled"}


# ---------------------------------------------------------------------------
# DELETE /api/v1/calendar/{post_id}
# ---------------------------------------------------------------------------

@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_post(
    post_id: str,
    current_user=Depends(get_current_user),
) -> None:
    """Cancel a scheduled post."""
    db = get_db()

    doc = await db.collection("scheduled_posts").document(post_id).get()
    if not doc.exists:
        raise NotFoundError(message="Post not found", detail=f"No scheduled post with id {post_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="Post not found", detail=f"No scheduled post with id {post_id}")

    if data.get("status") in ("published", "publishing"):
        raise ValidationError(
            message="Cannot cancel",
            detail=f"Post is '{data['status']}' and cannot be cancelled.",
        )

    now = datetime.now(timezone.utc)
    await db.collection("scheduled_posts").document(post_id).update({
        "status": "cancelled",
        "updated_at": now,
    })

    # Revert output status
    output_id = data.get("output_id")
    if output_id:
        output_doc = await db.collection("generated_outputs").document(output_id).get()
        if output_doc.exists and output_doc.to_dict().get("status") == "scheduled":
            await db.collection("generated_outputs").document(output_id).update({
                "status": "approved",
                "scheduled_at": None,
                "updated_at": now,
            })
