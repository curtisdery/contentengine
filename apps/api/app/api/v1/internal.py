"""Internal task endpoints — secured by Cloud Tasks OIDC, no user auth."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request

from app.core.encryption import decrypt
from app.core.firestore import get_db
from app.core.tasks import enqueue_task
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
