"""Background publishing worker for Pandocast.

Polls the ScheduledEvent table for due events and publishes them via the
appropriate platform publisher. Also runs periodic analytics sync.

Usage:
    python -m app.worker
"""

import asyncio
import logging
import signal
import sys
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.calendar import ScheduledEvent
from app.models.content import ContentUpload, GeneratedOutput
from app.models.platform_connection import PlatformConnection
from app.services.publisher import PublisherRegistry, init_publishers
from app.services.scheduler import SchedulerService
from app.services.analytics import AnalyticsService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("pandocast.worker")

scheduler_service = SchedulerService()
analytics_service = AnalyticsService()

# Interval configuration (seconds)
PUBLISH_INTERVAL = 60       # Check for due events every 60 seconds
ANALYTICS_INTERVAL = 21600  # Sync analytics every 6 hours (21600s)

# Graceful shutdown flag
_shutdown = False


def _signal_handler(sig: int, frame: object) -> None:
    global _shutdown
    logger.info("Received signal %s — shutting down gracefully...", signal.Signals(sig).name)
    _shutdown = True


# ---------------------------------------------------------------------------
# Publish Worker
# ---------------------------------------------------------------------------


async def publish_due_events() -> int:
    """Find and publish all due scheduled events. Returns count of processed events."""
    processed = 0

    async with async_session_factory() as db:
        try:
            due_events = await scheduler_service.get_due_events(db=db, limit=50)

            if not due_events:
                return 0

            logger.info("Found %d due events to publish", len(due_events))

            for event in due_events:
                if _shutdown:
                    break

                try:
                    await _publish_single_event(db, event)
                    processed += 1
                except Exception as e:
                    logger.error("Error processing event %s: %s", event.id, e, exc_info=True)
                    try:
                        await scheduler_service.mark_failed(
                            db=db, event_id=event.id, error=f"Worker error: {e}"
                        )
                    except Exception:
                        logger.error("Failed to mark event %s as failed", event.id, exc_info=True)

            await db.commit()
        except Exception as e:
            logger.error("Error in publish cycle: %s", e, exc_info=True)
            await db.rollback()

    return processed


async def _publish_single_event(db: AsyncSession, event: ScheduledEvent) -> None:
    """Process a single scheduled event: validate, publish, and update status."""
    logger.info(
        "Processing event %s (platform=%s, output=%s)",
        event.id, event.platform_id, event.generated_output_id,
    )

    # Mark as publishing
    await scheduler_service.mark_publishing(db=db, event_id=event.id)

    # Load the generated output
    output_result = await db.execute(
        select(GeneratedOutput).where(GeneratedOutput.id == event.generated_output_id)
    )
    output = output_result.scalar_one_or_none()
    if not output:
        await scheduler_service.mark_failed(
            db=db, event_id=event.id, error="Generated output not found."
        )
        return

    # Find the platform connection
    conn_result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.workspace_id == event.workspace_id,
            PlatformConnection.platform_id == _normalize_platform_id(event.platform_id),
            PlatformConnection.is_active == True,  # noqa: E712
        )
    )
    connection = conn_result.scalar_one_or_none()

    if not connection:
        await scheduler_service.mark_failed(
            db=db,
            event_id=event.id,
            error=f"No active connection for platform '{event.platform_id}'. Connect the platform first.",
        )
        return

    # Get the publisher
    publisher = PublisherRegistry.get(event.platform_id)
    if not publisher:
        await scheduler_service.mark_failed(
            db=db,
            event_id=event.id,
            error=f"No publisher available for platform '{event.platform_id}'.",
        )
        return

    # Validate connection (refresh token if needed)
    try:
        is_valid = await publisher.validate_connection(connection)
        if not is_valid:
            connection = await publisher.refresh_token(connection)
    except Exception as e:
        logger.warning("Token validation/refresh failed for %s: %s", event.platform_id, e)
        # Continue anyway — the publish attempt will fail with 401 if truly expired

    # Publish
    try:
        result = await publisher.publish(
            content=output.content,
            metadata=output.output_metadata or {},
            connection=connection,
        )
    except Exception as e:
        result = {
            "success": False,
            "post_id": None,
            "url": None,
            "error": f"Publisher exception: {e}",
        }

    if result.get("success"):
        await scheduler_service.mark_published(
            db=db,
            event_id=event.id,
            platform_post_id=result.get("post_id"),
        )
        logger.info(
            "Published event %s to %s — post_id=%s url=%s",
            event.id, event.platform_id, result.get("post_id"), result.get("url"),
        )
    else:
        error_msg = result.get("error", "Unknown publishing error")
        await scheduler_service.mark_failed(
            db=db, event_id=event.id, error=error_msg,
        )
        logger.warning(
            "Failed to publish event %s to %s: %s",
            event.id, event.platform_id, error_msg,
        )


def _normalize_platform_id(platform_id: str) -> str:
    """Normalize platform_id to the base connection platform.

    E.g., 'twitter_single' and 'twitter_thread' both use the 'twitter' connection,
    'linkedin_post' and 'linkedin_article' both use 'linkedin'.
    """
    platform_map = {
        "twitter_single": "twitter",
        "twitter_thread": "twitter",
        "linkedin_post": "linkedin",
        "linkedin_article": "linkedin",
        "bluesky_post": "bluesky",
        "instagram_carousel": "instagram",
        "instagram_caption": "instagram",
        "pinterest_pin": "pinterest",
        "medium_post": "medium",
        "youtube_longform": "youtube",
        "short_form_video": "tiktok",
        "reddit_post": "reddit",
        "quora_answer": "quora",
    }
    return platform_map.get(platform_id, platform_id)


# ---------------------------------------------------------------------------
# Analytics Sync
# ---------------------------------------------------------------------------


async def sync_analytics() -> int:
    """Fetch latest metrics for all recently published outputs. Returns count synced."""
    synced = 0

    try:
        # Import collector lazily to avoid circular imports
        from app.services.analytics_collector import AnalyticsCollectorRegistry

        async with async_session_factory() as db:
            try:
                # Get all published events from last 30 days with a platform_post_id
                from datetime import timedelta
                cutoff = datetime.now(timezone.utc) - timedelta(days=30)

                result = await db.execute(
                    select(ScheduledEvent)
                    .where(
                        ScheduledEvent.status == "published",
                        ScheduledEvent.published_at >= cutoff,
                    )
                )
                events = list(result.scalars().all())

                if not events:
                    logger.info("No published events to sync analytics for")
                    return 0

                logger.info("Syncing analytics for %d published events", len(events))

                # Track content IDs for multiplier score recalculation
                content_ids_to_recalculate: set = set()

                for event in events:
                    if _shutdown:
                        break

                    # Load the output to get platform_post_id
                    output_result = await db.execute(
                        select(GeneratedOutput).where(
                            GeneratedOutput.id == event.generated_output_id
                        )
                    )
                    output = output_result.scalar_one_or_none()
                    if not output or not output.platform_post_id:
                        continue

                    # Get the connection for this platform
                    base_platform = _normalize_platform_id(event.platform_id)
                    conn_result = await db.execute(
                        select(PlatformConnection).where(
                            PlatformConnection.workspace_id == event.workspace_id,
                            PlatformConnection.platform_id == base_platform,
                            PlatformConnection.is_active == True,  # noqa: E712
                        )
                    )
                    connection = conn_result.scalar_one_or_none()
                    if not connection:
                        continue

                    collector = AnalyticsCollectorRegistry.get(event.platform_id)
                    if not collector:
                        continue

                    try:
                        metrics = await collector.fetch_metrics(connection, output.platform_post_id)
                        if metrics:
                            await analytics_service.record_snapshot(
                                db=db,
                                output_id=output.id,
                                workspace_id=event.workspace_id,
                                metrics=metrics,
                            )
                            content_ids_to_recalculate.add(
                                (output.content_upload_id, event.workspace_id)
                            )
                            synced += 1
                    except Exception as e:
                        logger.warning(
                            "Failed to fetch analytics for output %s on %s: %s",
                            output.id, event.platform_id, e,
                        )

                # Recalculate multiplier scores for content with new snapshots
                for content_id, workspace_id in content_ids_to_recalculate:
                    try:
                        await analytics_service.calculate_multiplier_score(
                            db=db,
                            content_upload_id=content_id,
                            workspace_id=workspace_id,
                        )
                    except Exception as e:
                        logger.warning(
                            "Failed to recalculate multiplier score for content %s: %s",
                            content_id, e,
                        )

                await db.commit()
                logger.info(
                    "Analytics sync complete: %d outputs synced, %d multiplier scores updated",
                    synced, len(content_ids_to_recalculate),
                )
            except Exception as e:
                logger.error("Error in analytics sync: %s", e, exc_info=True)
                await db.rollback()

    except ImportError:
        logger.info("Analytics collector not available yet — skipping sync")

    return synced


# ---------------------------------------------------------------------------
# Main Worker Loop
# ---------------------------------------------------------------------------


async def main() -> None:
    """Main worker loop. Runs publish checks every 60s and analytics sync every 6h."""
    global _shutdown

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    # Initialize publishers
    init_publishers()

    logger.info("Pandocast worker started")
    logger.info("  Publish interval: %ds", PUBLISH_INTERVAL)
    logger.info("  Analytics sync interval: %ds", ANALYTICS_INTERVAL)

    last_analytics_sync = 0.0

    while not _shutdown:
        # --- Publish due events ---
        try:
            count = await publish_due_events()
            if count > 0:
                logger.info("Published %d events this cycle", count)
        except Exception as e:
            logger.error("Publish cycle failed: %s", e, exc_info=True)

        # --- Analytics sync (every ANALYTICS_INTERVAL seconds) ---
        now = asyncio.get_event_loop().time()
        if now - last_analytics_sync >= ANALYTICS_INTERVAL:
            try:
                synced = await sync_analytics()
                if synced > 0:
                    logger.info("Analytics sync: %d outputs updated", synced)
            except Exception as e:
                logger.error("Analytics sync failed: %s", e, exc_info=True)
            last_analytics_sync = now

        # Sleep in small increments for responsive shutdown
        for _ in range(PUBLISH_INTERVAL):
            if _shutdown:
                break
            await asyncio.sleep(1)

    logger.info("Pandocast worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
