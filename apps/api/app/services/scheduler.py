"""Scheduler service — calendar management, distribution arcs, and content gap detection."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar import ScheduledEvent
from app.models.content import GeneratedOutput
from app.platforms.profiles import PLATFORMS, get_platform
from app.utils.exceptions import NotFoundError, ValidationError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Distribution arc day offsets by platform_id.
#
# Strategy:
# Day 1: LinkedIn post + Twitter thread (thought leadership first)
# Day 2: Instagram carousel (visual while buzz active)
# Day 3: Email newsletter (deep dive to owned audience)
# Day 4: Bluesky post (community take)
# Day 5: Short-form video scripts (TikTok/Reels/Shorts)
# Day 7: Reddit post (community value, time gap to avoid spam)
# Day 10+: Quora, Pinterest, Medium (evergreen long-tail)
# ---------------------------------------------------------------------------

DISTRIBUTION_ARC: dict[str, dict] = {
    # Day 1 — Thought leadership launch
    "linkedin_post": {"day": 1, "hour": 9, "minute": 0},
    "twitter_thread": {"day": 1, "hour": 12, "minute": 0},
    "twitter_single": {"day": 1, "hour": 15, "minute": 0},
    "linkedin_article": {"day": 1, "hour": 10, "minute": 30},
    # Day 2 — Visual engagement
    "instagram_carousel": {"day": 2, "hour": 11, "minute": 0},
    "instagram_caption": {"day": 2, "hour": 14, "minute": 0},
    # Day 3 — Owned audience deep dive
    "email_newsletter": {"day": 3, "hour": 8, "minute": 0},
    "blog_seo": {"day": 3, "hour": 10, "minute": 0},
    # Day 4 — Community platforms
    "bluesky_post": {"day": 4, "hour": 10, "minute": 0},
    # Day 5 — Video scripts
    "short_form_video": {"day": 5, "hour": 11, "minute": 0},
    "youtube_longform": {"day": 5, "hour": 14, "minute": 0},
    "podcast_talking_points": {"day": 5, "hour": 16, "minute": 0},
    # Day 7 — Community value (time gap)
    "reddit_post": {"day": 7, "hour": 10, "minute": 0},
    # Day 10+ — Evergreen long-tail
    "quora_answer": {"day": 10, "hour": 10, "minute": 0},
    "pinterest_pin": {"day": 10, "hour": 14, "minute": 0},
    "medium_post": {"day": 12, "hour": 9, "minute": 0},
    # Day 14+ — Professional formats
    "press_release": {"day": 14, "hour": 9, "minute": 0},
    "slide_deck": {"day": 14, "hour": 11, "minute": 0},
}

# Recommended posting cadence in days, parsed from platform profile strings.
# These are rough heuristics extracted from the cadence text.
CADENCE_DAYS: dict[str, int] = {
    "twitter_single": 1,
    "twitter_thread": 3,
    "linkedin_post": 2,
    "linkedin_article": 14,
    "bluesky_post": 1,
    "instagram_carousel": 2,
    "instagram_caption": 2,
    "pinterest_pin": 1,
    "blog_seo": 3,
    "email_newsletter": 4,
    "medium_post": 4,
    "youtube_longform": 4,
    "short_form_video": 1,
    "podcast_talking_points": 4,
    "reddit_post": 2,
    "quora_answer": 2,
    "press_release": 60,
    "slide_deck": 30,
}


class SchedulerService:
    """Manages scheduling, distribution arcs, content gap detection, and the publishing queue."""

    # ------------------------------------------------------------------
    # Distribution Arc
    # ------------------------------------------------------------------

    def create_distribution_arc(
        self,
        outputs: list[GeneratedOutput],
        start_date: datetime,
    ) -> list[dict]:
        """Create an intelligent publishing sequence from generated outputs.

        Maps each output to its ideal distribution day and time based on
        the platform's position in the content distribution arc.

        Returns a list of dicts:
            {output_id: UUID, platform_id: str, suggested_datetime: datetime}
        """
        if not outputs:
            return []

        # Ensure start_date is timezone-aware
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)

        # Normalise start_date to midnight
        base = start_date.replace(hour=0, minute=0, second=0, microsecond=0)

        arc_items: list[dict] = []

        for output in outputs:
            platform_id = output.platform_id
            arc_info = DISTRIBUTION_ARC.get(platform_id)

            if arc_info is None:
                # Unknown platform — schedule at day 7 as a safe default
                arc_info = {"day": 7, "hour": 12, "minute": 0}

            suggested = base + timedelta(days=arc_info["day"] - 1)
            suggested = suggested.replace(
                hour=arc_info["hour"],
                minute=arc_info["minute"],
                second=0,
                microsecond=0,
            )

            # If the suggested time is in the past, push to today + 1 hour
            now = datetime.now(timezone.utc)
            if suggested < now:
                suggested = now + timedelta(hours=1)
                suggested = suggested.replace(second=0, microsecond=0)

            arc_items.append(
                {
                    "output_id": output.id,
                    "platform_id": platform_id,
                    "suggested_datetime": suggested,
                }
            )

        # Sort by suggested_datetime for a clean chronological schedule
        arc_items.sort(key=lambda x: x["suggested_datetime"])
        return arc_items

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def schedule_output(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        output_id: UUID,
        scheduled_at: datetime,
        priority: int = 1,
    ) -> ScheduledEvent:
        """Schedule a single output for publishing.

        Also updates the corresponding GeneratedOutput status to 'scheduled'.
        """
        # Ensure timezone-aware
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

        # Load the output and verify workspace ownership
        result = await db.execute(
            select(GeneratedOutput).where(GeneratedOutput.id == output_id)
        )
        output = result.scalar_one_or_none()
        if not output:
            raise NotFoundError(
                message="Output not found",
                detail=f"No generated output found with id {output_id}",
            )

        # Check if already scheduled
        existing = await db.execute(
            select(ScheduledEvent).where(
                ScheduledEvent.generated_output_id == output_id,
                ScheduledEvent.status.in_(["scheduled", "publishing"]),
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(
                message="Output already scheduled",
                detail=f"Output {output_id} already has an active scheduled event. Reschedule or cancel it first.",
            )

        event = ScheduledEvent(
            workspace_id=workspace_id,
            generated_output_id=output_id,
            platform_id=output.platform_id,
            scheduled_at=scheduled_at,
            priority=priority,
            status="scheduled",
        )
        db.add(event)

        # Update the output status
        output.status = "scheduled"
        output.scheduled_at = scheduled_at

        await db.flush()
        await db.refresh(event)
        return event

    async def schedule_batch(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        schedule_items: list[dict],
    ) -> list[ScheduledEvent]:
        """Schedule multiple outputs at once (e.g. from a distribution arc).

        Each item in schedule_items should have:
            {output_id: UUID, scheduled_at: datetime}
        Optional: priority (defaults to 5 for batch/autopilot).
        """
        events: list[ScheduledEvent] = []

        for item in schedule_items:
            output_id = item["output_id"]
            scheduled_at = item.get("suggested_datetime") or item.get("scheduled_at")
            priority = item.get("priority", 5)

            try:
                event = await self.schedule_output(
                    db=db,
                    workspace_id=workspace_id,
                    output_id=output_id,
                    scheduled_at=scheduled_at,
                    priority=priority,
                )
                events.append(event)
            except (NotFoundError, ValidationError) as e:
                logger.warning(
                    "Skipping output %s in batch schedule: %s", output_id, e.message
                )
                continue

        return events

    async def reschedule(
        self,
        db: AsyncSession,
        event_id: UUID,
        workspace_id: UUID,
        new_datetime: datetime,
    ) -> ScheduledEvent:
        """Move a scheduled event to a new time."""
        if new_datetime.tzinfo is None:
            new_datetime = new_datetime.replace(tzinfo=timezone.utc)

        result = await db.execute(
            select(ScheduledEvent).where(
                ScheduledEvent.id == event_id,
                ScheduledEvent.workspace_id == workspace_id,
            )
        )
        event = result.scalar_one_or_none()
        if not event:
            raise NotFoundError(
                message="Scheduled event not found",
                detail=f"No scheduled event found with id {event_id}",
            )

        if event.status not in ("scheduled", "failed"):
            raise ValidationError(
                message="Cannot reschedule",
                detail=f"Event is in '{event.status}' status. Only 'scheduled' or 'failed' events can be rescheduled.",
            )

        event.scheduled_at = new_datetime
        event.status = "scheduled"
        event.publish_error = None

        # Also update the output
        output_result = await db.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.id == event.generated_output_id
            )
        )
        output = output_result.scalar_one_or_none()
        if output:
            output.scheduled_at = new_datetime

        await db.flush()
        await db.refresh(event)
        return event

    async def cancel_scheduled(
        self,
        db: AsyncSession,
        event_id: UUID,
        workspace_id: UUID,
    ) -> None:
        """Cancel a scheduled event. Sets status to 'cancelled'."""
        result = await db.execute(
            select(ScheduledEvent).where(
                ScheduledEvent.id == event_id,
                ScheduledEvent.workspace_id == workspace_id,
            )
        )
        event = result.scalar_one_or_none()
        if not event:
            raise NotFoundError(
                message="Scheduled event not found",
                detail=f"No scheduled event found with id {event_id}",
            )

        if event.status in ("published", "publishing"):
            raise ValidationError(
                message="Cannot cancel",
                detail=f"Event is in '{event.status}' status and cannot be cancelled.",
            )

        event.status = "cancelled"

        # Revert the output status back to approved
        output_result = await db.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.id == event.generated_output_id
            )
        )
        output = output_result.scalar_one_or_none()
        if output and output.status == "scheduled":
            output.status = "approved"
            output.scheduled_at = None

        await db.flush()

    async def get_calendar_events(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        start: datetime,
        end: datetime,
        platform_id: str | None = None,
    ) -> list[ScheduledEvent]:
        """Get all events in a date range, optionally filtered by platform."""
        query = (
            select(ScheduledEvent)
            .where(
                ScheduledEvent.workspace_id == workspace_id,
                ScheduledEvent.scheduled_at >= start,
                ScheduledEvent.scheduled_at <= end,
            )
            .order_by(ScheduledEvent.scheduled_at.asc())
        )

        if platform_id:
            query = query.where(ScheduledEvent.platform_id == platform_id)

        result = await db.execute(query)
        return list(result.scalars().all())

    async def get_upcoming(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        limit: int = 20,
    ) -> list[ScheduledEvent]:
        """Get next N upcoming scheduled events."""
        now = datetime.now(timezone.utc)

        result = await db.execute(
            select(ScheduledEvent)
            .where(
                ScheduledEvent.workspace_id == workspace_id,
                ScheduledEvent.scheduled_at >= now,
                ScheduledEvent.status == "scheduled",
            )
            .order_by(ScheduledEvent.scheduled_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Content Gap Detection
    # ------------------------------------------------------------------

    async def detect_content_gaps(
        self,
        db: AsyncSession,
        workspace_id: UUID,
    ) -> list[dict]:
        """Analyze scheduling patterns and detect content gaps.

        For each platform that has ever had a scheduled event (or is in the
        known platforms list), finds the most recent event and compares
        against the recommended posting cadence.

        Returns a list of gap analysis dicts sorted by severity (worst first).
        """
        now = datetime.now(timezone.utc)
        gaps: list[dict] = []

        # Get all platform_ids that have been used in this workspace
        used_result = await db.execute(
            select(ScheduledEvent.platform_id)
            .where(ScheduledEvent.workspace_id == workspace_id)
            .distinct()
        )
        used_platform_ids = {row[0] for row in used_result.fetchall()}

        # Also consider platforms from active connections (if any exist)
        # We check all known platforms that were either used or are in the PLATFORMS registry
        all_platform_ids = used_platform_ids | set(PLATFORMS.keys())

        for platform_id in sorted(all_platform_ids):
            profile = get_platform(platform_id)
            if not profile:
                continue

            platform_name = profile.name
            recommended_cadence = CADENCE_DAYS.get(platform_id, 7)

            # Find the most recent scheduled or published event for this platform
            last_event_result = await db.execute(
                select(ScheduledEvent)
                .where(
                    ScheduledEvent.workspace_id == workspace_id,
                    ScheduledEvent.platform_id == platform_id,
                    ScheduledEvent.status.in_(["scheduled", "published", "publishing"]),
                )
                .order_by(ScheduledEvent.scheduled_at.desc())
                .limit(1)
            )
            last_event = last_event_result.scalar_one_or_none()

            if last_event and last_event.scheduled_at:
                last_scheduled_at = last_event.scheduled_at
                if last_scheduled_at.tzinfo is None:
                    last_scheduled_at = last_scheduled_at.replace(tzinfo=timezone.utc)
                days_since = (now - last_scheduled_at).days
            else:
                last_scheduled_at = None
                # If never scheduled, consider it a large gap only if the platform
                # has been used before. For unused platforms, report a mild gap.
                if platform_id in used_platform_ids:
                    days_since = 999
                else:
                    days_since = recommended_cadence + 1  # Just past threshold

            # Calculate gap severity
            ratio = days_since / max(recommended_cadence, 1)
            if ratio <= 1.0:
                severity = "none"
            elif ratio <= 1.5:
                severity = "mild"
            elif ratio <= 3.0:
                severity = "moderate"
            else:
                severity = "severe"

            # Generate human-readable suggestion
            suggestion = self._build_gap_suggestion(
                platform_name=platform_name,
                days_since=days_since,
                recommended_cadence=recommended_cadence,
                severity=severity,
                has_history=platform_id in used_platform_ids,
            )

            gaps.append(
                {
                    "platform_id": platform_id,
                    "platform_name": platform_name,
                    "last_scheduled_at": last_scheduled_at,
                    "days_since_last": days_since,
                    "recommended_cadence_days": recommended_cadence,
                    "gap_severity": severity,
                    "suggestion": suggestion,
                }
            )

        # Sort by severity (severe first), then by days_since_last descending
        severity_order = {"severe": 0, "moderate": 1, "mild": 2, "none": 3}
        gaps.sort(key=lambda g: (severity_order.get(g["gap_severity"], 4), -g["days_since_last"]))

        return gaps

    @staticmethod
    def _build_gap_suggestion(
        platform_name: str,
        days_since: int,
        recommended_cadence: int,
        severity: str,
        has_history: bool,
    ) -> str:
        """Build a human-readable suggestion for a content gap."""
        if severity == "none":
            return f"You're on track with {platform_name}. Keep it up!"

        if not has_history:
            return (
                f"You haven't published to {platform_name} yet. "
                f"Recommended cadence is every {recommended_cadence} day(s). "
                f"Consider adding it to your next distribution arc."
            )

        if severity == "mild":
            return (
                f"It's been {days_since} day(s) since your last {platform_name} post. "
                f"Recommended cadence is every {recommended_cadence} day(s). "
                f"Consider scheduling something soon."
            )

        if severity == "moderate":
            return (
                f"You haven't posted on {platform_name} in {days_since} days. "
                f"That's {days_since // max(recommended_cadence, 1)}x your recommended cadence. "
                f"Your audience engagement may be declining."
            )

        # severe
        return (
            f"Critical gap: {days_since} days without a {platform_name} post. "
            f"Recommended cadence is every {recommended_cadence} day(s). "
            f"Prioritize this platform to rebuild momentum."
        )

    # ------------------------------------------------------------------
    # Publishing Queue
    # ------------------------------------------------------------------

    async def get_due_events(
        self,
        db: AsyncSession,
        limit: int = 50,
    ) -> list[ScheduledEvent]:
        """Get events that are due for publishing.

        Returns events where scheduled_at <= now and status = 'scheduled',
        ordered by priority ASC (highest priority first), then scheduled_at ASC.
        """
        now = datetime.now(timezone.utc)

        result = await db.execute(
            select(ScheduledEvent)
            .where(
                ScheduledEvent.scheduled_at <= now,
                ScheduledEvent.status == "scheduled",
            )
            .order_by(
                ScheduledEvent.priority.asc(),
                ScheduledEvent.scheduled_at.asc(),
            )
            .limit(limit)
        )
        return list(result.scalars().all())

    async def mark_publishing(
        self,
        db: AsyncSession,
        event_id: UUID,
    ) -> ScheduledEvent:
        """Set status to 'publishing'. Called when the publisher picks up the event."""
        result = await db.execute(
            select(ScheduledEvent).where(ScheduledEvent.id == event_id)
        )
        event = result.scalar_one_or_none()
        if not event:
            raise NotFoundError(
                message="Scheduled event not found",
                detail=f"No scheduled event found with id {event_id}",
            )

        event.status = "publishing"
        await db.flush()
        await db.refresh(event)
        return event

    async def mark_published(
        self,
        db: AsyncSession,
        event_id: UUID,
        platform_post_id: str | None = None,
    ) -> ScheduledEvent:
        """Set status to 'published', store platform_post_id, set published_at."""
        result = await db.execute(
            select(ScheduledEvent).where(ScheduledEvent.id == event_id)
        )
        event = result.scalar_one_or_none()
        if not event:
            raise NotFoundError(
                message="Scheduled event not found",
                detail=f"No scheduled event found with id {event_id}",
            )

        now = datetime.now(timezone.utc)
        event.status = "published"
        event.published_at = now
        event.publish_error = None

        # Also update the GeneratedOutput
        output_result = await db.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.id == event.generated_output_id
            )
        )
        output = output_result.scalar_one_or_none()
        if output:
            output.status = "published"
            output.published_at = now
            if platform_post_id:
                output.platform_post_id = platform_post_id

        await db.flush()
        await db.refresh(event)
        return event

    async def mark_failed(
        self,
        db: AsyncSession,
        event_id: UUID,
        error: str,
    ) -> ScheduledEvent:
        """Set status to 'failed', store error, and handle retry logic.

        If retry_count < max_retries, the event is re-queued with exponential
        backoff: the scheduled_at is pushed forward by 2^retry_count * 60 seconds.
        """
        result = await db.execute(
            select(ScheduledEvent).where(ScheduledEvent.id == event_id)
        )
        event = result.scalar_one_or_none()
        if not event:
            raise NotFoundError(
                message="Scheduled event not found",
                detail=f"No scheduled event found with id {event_id}",
            )

        event.retry_count += 1
        event.publish_error = error

        if event.retry_count < event.max_retries:
            # Exponential backoff: 2^retry_count * 60 seconds
            backoff_seconds = (2 ** event.retry_count) * 60
            new_scheduled = datetime.now(timezone.utc) + timedelta(seconds=backoff_seconds)
            event.scheduled_at = new_scheduled
            event.status = "scheduled"
            logger.info(
                "Event %s retry %d/%d — rescheduled to %s (backoff %ds)",
                event_id,
                event.retry_count,
                event.max_retries,
                new_scheduled.isoformat(),
                backoff_seconds,
            )
        else:
            event.status = "failed"
            logger.warning(
                "Event %s exhausted all %d retries. Marking as failed.",
                event_id,
                event.max_retries,
            )

            # Update the output status to failed
            output_result = await db.execute(
                select(GeneratedOutput).where(
                    GeneratedOutput.id == event.generated_output_id
                )
            )
            output = output_result.scalar_one_or_none()
            if output:
                output.status = "failed"

        await db.flush()
        await db.refresh(event)
        return event
