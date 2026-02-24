"""Internal task endpoints — secured by Cloud Tasks OIDC, no user auth."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request

from app.core.encryption import decrypt
from app.core.firestore import get_db
from app.core.tasks import enqueue_task
from app.services.fetchers.base import get_fetcher
from app.services.platforms.base import get_platform_service
from app.services.publishers.base import get_publisher

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/tasks/refresh-expiring-tokens")
async def refresh_expiring_tokens() -> dict:
    """Refresh tokens that expire within the next hour.

    Called by Cloud Tasks on a schedule. Iterates all active connections
    with token_expires_at < now + 1 hour and refreshes them.
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    from datetime import timedelta
    threshold = now + timedelta(hours=1)

    query = (
        db.collection("connected_platforms")
        .where("is_active", "==", True)
        .where("token_expires_at", "<=", threshold)
    )

    refreshed = 0
    failed = 0

    async for doc in query.stream():
        data = doc.to_dict()
        platform_id = data.get("platform", "")
        connection_id = doc.id

        try:
            service = get_platform_service(platform_id)
            await service.refresh_token(connection_id)
            refreshed += 1
            logger.info("Refreshed token for %s connection %s", platform_id, connection_id)
        except Exception:
            failed += 1
            logger.warning(
                "Failed to refresh token for %s connection %s",
                platform_id, connection_id, exc_info=True,
            )

    return {"refreshed": refreshed, "failed": failed}


# ---------------------------------------------------------------------------
# POST /internal/tasks/publish-post — publish a single scheduled post
# ---------------------------------------------------------------------------

@router.post("/tasks/publish-post")
async def publish_post(request: Request) -> dict:
    """Publish a single scheduled post. Idempotent — skips if already published.

    Payload: {"event_id": str}
    """
    body = await request.json()
    event_id = body.get("event_id")
    if not event_id:
        return {"status": "skipped", "reason": "missing event_id"}

    db = get_db()
    event_ref = db.collection("scheduled_posts").document(event_id)
    event_doc = await event_ref.get()

    if not event_doc.exists:
        logger.warning("publish-post: event %s not found", event_id)
        return {"status": "skipped", "reason": "event_not_found"}

    event = event_doc.to_dict()

    # Idempotent — skip if already published or cancelled
    if event.get("status") in ("published", "cancelled"):
        return {"status": "skipped", "reason": f"already_{event['status']}"}

    # Mark as publishing
    await event_ref.update({"status": "publishing", "updated_at": datetime.now(timezone.utc)})

    user_id = event.get("user_id")
    platform = event.get("platform", "")
    output_id = event.get("output_id")

    # Load output content
    output_doc = await db.collection("generated_outputs").document(output_id).get()
    if not output_doc.exists:
        await event_ref.update({
            "status": "failed",
            "publish_error": "Output not found",
            "updated_at": datetime.now(timezone.utc),
        })
        return {"status": "failed", "reason": "output_not_found"}

    output = output_doc.to_dict()

    # Load connection + decrypt token
    conn_query = (
        db.collection("connected_platforms")
        .where("user_id", "==", user_id)
        .where("platform", "==", platform)
        .where("is_active", "==", True)
        .limit(1)
    )
    connections = [doc async for doc in conn_query.stream()]
    if not connections:
        await event_ref.update({
            "status": "failed",
            "publish_error": f"No active {platform} connection",
            "updated_at": datetime.now(timezone.utc),
        })
        return {"status": "failed", "reason": "no_connection"}

    conn_data = connections[0].to_dict()
    try:
        access_token = decrypt(conn_data["access_token_encrypted"])
    except Exception:
        await event_ref.update({
            "status": "failed",
            "publish_error": "Token decryption failed",
            "updated_at": datetime.now(timezone.utc),
        })
        return {"status": "failed", "reason": "token_decryption_failed"}

    # Publish via platform publisher
    try:
        publisher = get_publisher(platform)
        publisher.validate(output)
        result = await publisher.publish(
            output=output,
            token=access_token,
            platform_user_id=conn_data.get("platform_user_id"),
        )
    except Exception as exc:
        error_msg = str(exc)
        logger.error("publish-post: %s failed for event %s: %s", platform, event_id, error_msg)

        retry_count = event.get("retry_count", 0) + 1
        max_retries = event.get("max_retries", 3)

        if retry_count < max_retries:
            # Exponential backoff: 2^retry * 60 seconds
            backoff = (2 ** retry_count) * 60
            await event_ref.update({
                "status": "scheduled",
                "retry_count": retry_count,
                "publish_error": error_msg,
                "scheduled_at": datetime.now(timezone.utc) + timedelta(seconds=backoff),
                "updated_at": datetime.now(timezone.utc),
            })
            return {"status": "retrying", "retry_count": retry_count, "backoff_seconds": backoff}
        else:
            await event_ref.update({
                "status": "failed",
                "retry_count": retry_count,
                "publish_error": error_msg,
                "updated_at": datetime.now(timezone.utc),
            })
            return {"status": "failed", "reason": error_msg}

    if not result.success:
        await event_ref.update({
            "status": "failed",
            "publish_error": result.error,
            "updated_at": datetime.now(timezone.utc),
        })
        return {"status": "failed", "reason": result.error}

    # Success — update event and output
    now = datetime.now(timezone.utc)
    await event_ref.update({
        "status": "published",
        "published_at": now,
        "platform_post_id": result.platform_post_id,
        "platform_post_url": result.platform_post_url,
        "publish_error": None,
        "updated_at": now,
    })

    await db.collection("generated_outputs").document(output_id).update({
        "status": "published",
        "published_at": now,
        "platform_post_id": result.platform_post_id,
        "updated_at": now,
    })

    # Increment usage counter
    from google.cloud.firestore_v1 import Increment
    await db.collection("users").document(user_id).update({
        "usage_this_period.posts_published": Increment(1),
        "updated_at": now,
    })

    logger.info("Published event %s to %s: %s", event_id, platform, result.platform_post_id)
    return {
        "status": "published",
        "platform_post_id": result.platform_post_id,
        "platform_post_url": result.platform_post_url,
    }


# ---------------------------------------------------------------------------
# POST /internal/tasks/check-due-posts — Cloud Scheduler every 1 min
# ---------------------------------------------------------------------------

@router.post("/tasks/check-due-posts")
async def check_due_posts() -> dict:
    """Find all scheduled posts that are due and enqueue each for publishing.

    Called by Cloud Scheduler every minute. For each due post, enqueues a
    publish-post task with dedup via event_id to prevent double-publishing.
    """
    db = get_db()
    now = datetime.now(timezone.utc)

    query = (
        db.collection("scheduled_posts")
        .where("status", "==", "scheduled")
        .where("scheduled_at", "<=", now)
    )

    enqueued = 0
    async for doc in query.stream():
        event_id = doc.id
        try:
            await enqueue_task(
                queue="publishing",
                handler="publish-post",
                payload={"event_id": event_id},
                task_id=f"publish-{event_id}",
            )
            enqueued += 1
        except Exception:
            logger.warning("Failed to enqueue publish task for event %s", event_id, exc_info=True)

    logger.info("check-due-posts: enqueued %d posts for publishing", enqueued)
    return {"enqueued": enqueued}


# ---------------------------------------------------------------------------
# POST /internal/tasks/poll-single-post — fetch metrics, store, check milestones
# ---------------------------------------------------------------------------

# Decaying poll intervals: 1h, 6h, 24h, 72h, 168h (1 week) after publish.
POLL_INTERVALS_SECONDS = [3600, 21600, 86400, 259200, 604800]

# Engagement milestones that trigger user notifications.
MILESTONES = [100, 500, 1_000, 5_000, 10_000, 50_000, 100_000]


@router.post("/tasks/poll-single-post")
async def poll_single_post(request: Request) -> dict:
    """Fetch latest metrics for a published post, store a snapshot, and check milestones.

    Payload: {"event_id": str, "poll_index": int}

    Self-chains by enqueuing the next poll at the next interval.
    """
    body = await request.json()
    event_id = body.get("event_id")
    poll_index = body.get("poll_index", 0)

    if not event_id:
        return {"status": "skipped", "reason": "missing event_id"}

    db = get_db()

    # Load the scheduled post
    event_doc = await db.collection("scheduled_posts").document(event_id).get()
    if not event_doc.exists:
        return {"status": "skipped", "reason": "event_not_found"}

    event = event_doc.to_dict()

    if event.get("status") != "published":
        return {"status": "skipped", "reason": f"not_published:{event.get('status')}"}

    user_id = event.get("user_id")
    platform = event.get("platform", "")
    platform_post_id = event.get("platform_post_id")

    if not platform_post_id:
        return {"status": "skipped", "reason": "no_platform_post_id"}

    # Load connection + decrypt token
    conn_query = (
        db.collection("connected_platforms")
        .where("user_id", "==", user_id)
        .where("platform", "==", platform)
        .where("is_active", "==", True)
        .limit(1)
    )
    connections = [doc async for doc in conn_query.stream()]
    if not connections:
        return {"status": "failed", "reason": "no_connection"}

    conn_data = connections[0].to_dict()
    try:
        access_token = decrypt(conn_data["access_token_encrypted"])
    except Exception:
        return {"status": "failed", "reason": "token_decryption_failed"}

    # Fetch metrics via platform fetcher
    try:
        fetcher = get_fetcher(platform)
        metrics = await fetcher.fetch(token=access_token, post_id=platform_post_id)
    except Exception as exc:
        logger.warning("poll-single-post: fetch failed for event %s: %s", event_id, exc)
        metrics = None

    if metrics is None:
        # Still chain next poll even on transient failure
        await _chain_next_poll(event_id, poll_index)
        return {"status": "fetch_failed", "poll_index": poll_index}

    now = datetime.now(timezone.utc)
    metrics_dict = metrics.to_dict()

    # Store analytics snapshot
    await db.collection("post_analytics").add({
        "user_id": user_id,
        "scheduled_post_id": event_id,
        "output_id": event.get("output_id"),
        "platform": platform,
        "poll_index": poll_index,
        "measured_at": now,
        **metrics_dict,
    })

    # Update the scheduled post with latest metrics summary
    await db.collection("scheduled_posts").document(event_id).update({
        "latest_impressions": metrics.impressions,
        "latest_engagements": metrics.engagements,
        "latest_engagement_rate": metrics.engagement_rate,
        "metrics_updated_at": now,
        "updated_at": now,
    })

    # Check milestones
    await _check_milestones(db, event_id, user_id, platform, metrics)

    # Chain next poll
    await _chain_next_poll(event_id, poll_index)

    logger.info(
        "poll-single-post: event %s poll %d — %d impressions, %d engagements",
        event_id, poll_index, metrics.impressions, metrics.engagements,
    )
    return {
        "status": "recorded",
        "poll_index": poll_index,
        "impressions": metrics.impressions,
        "engagements": metrics.engagements,
    }


async def _chain_next_poll(event_id: str, current_index: int) -> None:
    """Enqueue the next poll at the next decay interval, if any remain."""
    next_index = current_index + 1
    if next_index >= len(POLL_INTERVALS_SECONDS):
        return

    try:
        await enqueue_task(
            queue="analytics-polling",
            handler="poll-single-post",
            payload={"event_id": event_id, "poll_index": next_index},
            delay_seconds=POLL_INTERVALS_SECONDS[next_index],
            task_id=f"poll-{event_id}-{next_index}",
        )
    except Exception:
        logger.warning("Failed to chain next poll for event %s index %d", event_id, next_index, exc_info=True)


async def _check_milestones(db, event_id: str, user_id: str, platform: str, metrics) -> None:
    """Check if impressions crossed a milestone and create a notification + milestone record."""
    impressions = metrics.impressions

    for threshold in MILESTONES:
        if impressions < threshold:
            break

        milestone_id = f"{event_id}_{threshold}"
        milestone_ref = db.collection("milestones").document(milestone_id)
        milestone_doc = await milestone_ref.get()

        if milestone_doc.exists:
            continue  # Already recorded

        now = datetime.now(timezone.utc)

        # Record milestone
        await milestone_ref.set({
            "user_id": user_id,
            "event_id": event_id,
            "platform": platform,
            "metric": "impressions",
            "threshold": threshold,
            "actual_value": impressions,
            "reached_at": now,
        })

        # Create notification for the user
        await db.collection("notifications").add({
            "user_id": user_id,
            "type": "milestone",
            "title": f"{_format_number(threshold)} impressions!",
            "body": f"Your {platform} post hit {_format_number(threshold)} impressions.",
            "data": {"event_id": event_id, "platform": platform, "threshold": threshold},
            "read": False,
            "created_at": now,
        })

        logger.info(
            "Milestone reached: event %s hit %d impressions on %s",
            event_id, threshold, platform,
        )


def _format_number(n: int) -> str:
    """Format a number with K/M suffixes for display."""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.0f}K"
    return str(n)


# ---------------------------------------------------------------------------
# POST /internal/tasks/recalculate-scores — Cloud Scheduler daily 3 AM UTC
# ---------------------------------------------------------------------------

@router.post("/tasks/recalculate-scores")
async def recalculate_scores() -> dict:
    """Recalculate Multiplier Scores for all content with published outputs.

    Called by Cloud Scheduler daily at 3 AM UTC. For each content_upload that
    has at least one published output, aggregates latest analytics snapshots
    into a cached multiplier_scores document.

    Multiplier = total_reach / single_platform_avg
    """
    db = get_db()
    now = datetime.now(timezone.utc)

    # Find all published scheduled posts grouped by content
    published_query = (
        db.collection("scheduled_posts")
        .where("status", "==", "published")
    )

    # Group events by content_upload (via output_id → content mapping)
    output_to_events: dict[str, list[dict]] = {}
    async for doc in published_query.stream():
        data = doc.to_dict()
        output_id = data.get("output_id", "")
        if output_id:
            output_to_events.setdefault(output_id, []).append({**data, "id": doc.id})

    if not output_to_events:
        return {"recalculated": 0, "reason": "no_published_posts"}

    # For each output, load its content_upload_id and latest analytics
    content_aggregates: dict[str, dict] = {}

    for output_id, events in output_to_events.items():
        output_doc = await db.collection("generated_outputs").document(output_id).get()
        if not output_doc.exists:
            continue

        output = output_doc.to_dict()
        content_id = output.get("content_upload_id", "")
        user_id = output.get("user_id", "")
        if not content_id:
            continue

        if content_id not in content_aggregates:
            content_aggregates[content_id] = {
                "user_id": user_id,
                "content_upload_id": content_id,
                "platforms": [],
                "total_reach": 0,
                "total_engagements": 0,
                "best_platform_id": None,
                "best_platform_reach": 0,
            }

        agg = content_aggregates[content_id]

        # Get latest analytics snapshot for this event
        for event in events:
            event_id = event["id"]
            platform = event.get("platform", "")

            snapshot_query = (
                db.collection("post_analytics")
                .where("scheduled_post_id", "==", event_id)
                .order_by("measured_at", direction="DESCENDING")
                .limit(1)
            )
            snapshots = [s async for s in snapshot_query.stream()]

            reach = 0
            engagements = 0
            engagement_rate = 0.0

            if snapshots:
                snap = snapshots[0].to_dict()
                reach = snap.get("impressions", 0)
                engagements = snap.get("engagements", 0)
                engagement_rate = snap.get("engagement_rate", 0.0)

            agg["total_reach"] += reach
            agg["total_engagements"] += engagements

            agg["platforms"].append({
                "platform": platform,
                "reach": reach,
                "engagements": engagements,
                "engagement_rate": round(engagement_rate, 4),
            })

            if reach > agg["best_platform_reach"]:
                agg["best_platform_reach"] = reach
                agg["best_platform_id"] = platform

    # Write multiplier_scores documents
    recalculated = 0
    for content_id, agg in content_aggregates.items():
        total_reach = agg["total_reach"]
        platforms = agg["platforms"]
        platform_count = len(platforms)

        # single_platform_avg = average reach per platform
        single_platform_avg = (total_reach / platform_count) if platform_count > 0 else 1
        multiplier = round(total_reach / max(single_platform_avg, 1), 1) if total_reach > 0 else 1.0

        await db.collection("multiplier_scores").document(content_id).set({
            "user_id": agg["user_id"],
            "content_upload_id": content_id,
            "multiplier_value": multiplier,
            "single_platform_avg": round(single_platform_avg),
            "total_reach": total_reach,
            "total_engagements": agg["total_engagements"],
            "platforms_published": platform_count,
            "platform_breakdown": platforms,
            "best_platform_id": agg["best_platform_id"],
            "best_platform_reach": agg["best_platform_reach"],
            "calculated_at": now,
            "updated_at": now,
        })
        recalculated += 1

    logger.info("recalculate-scores: updated %d content multiplier scores", recalculated)
    return {"recalculated": recalculated}
