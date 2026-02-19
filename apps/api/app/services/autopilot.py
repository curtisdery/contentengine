"""Autopilot service — trust-based auto-publishing with progressive automation."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.autopilot import AutopilotConfig
from app.models.content import GeneratedOutput
from app.platforms.profiles import get_platform, get_all_platforms
from app.utils.exceptions import NotFoundError, ValidationError

logger = logging.getLogger(__name__)


class AutopilotService:
    """Manages autopilot configuration, trust metrics, and auto-publishing."""

    # ------------------------------------------------------------------
    # Config Management
    # ------------------------------------------------------------------

    async def get_config(
        self, db: AsyncSession, workspace_id: UUID, platform_id: str
    ) -> AutopilotConfig:
        """Get or create autopilot config for a platform."""
        result = await db.execute(
            select(AutopilotConfig).where(
                AutopilotConfig.workspace_id == workspace_id,
                AutopilotConfig.platform_id == platform_id,
            )
        )
        config = result.scalar_one_or_none()

        if not config:
            config = AutopilotConfig(
                workspace_id=workspace_id,
                platform_id=platform_id,
            )
            db.add(config)
            await db.flush()
            await db.refresh(config)

        return config

    async def get_all_configs(
        self, db: AsyncSession, workspace_id: UUID
    ) -> list[AutopilotConfig]:
        """Get all autopilot configs for a workspace."""
        result = await db.execute(
            select(AutopilotConfig).where(
                AutopilotConfig.workspace_id == workspace_id,
            )
        )
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Trust Metrics
    # ------------------------------------------------------------------

    async def record_review(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        platform_id: str,
        was_edited: bool,
    ) -> AutopilotConfig:
        """Record a content review. Updates approval rate.

        If was_edited=False, increments approved_without_edit.
        Always increments total_outputs_reviewed.
        Recalculates approval_rate.
        """
        config = await self.get_config(db, workspace_id, platform_id)

        config.total_outputs_reviewed += 1
        if not was_edited:
            config.approved_without_edit += 1

        # Recalculate approval rate
        config.approval_rate = (
            config.approved_without_edit / config.total_outputs_reviewed
            if config.total_outputs_reviewed > 0
            else 0.0
        )

        await db.flush()
        await db.refresh(config)
        return config

    async def check_eligibility(
        self, db: AsyncSession, workspace_id: UUID, platform_id: str
    ) -> dict:
        """Check if a platform is eligible for autopilot.

        Returns:
            {
                eligible: bool,
                current_approval_rate: float,
                required_approval_rate: float,
                reviews_completed: int,
                reviews_required: int,
                message: str
            }
        """
        config = await self.get_config(db, workspace_id, platform_id)

        enough_reviews = config.total_outputs_reviewed >= config.required_minimum_reviews
        high_enough_rate = config.approval_rate >= config.required_approval_rate
        eligible = enough_reviews and high_enough_rate

        if not enough_reviews:
            remaining = config.required_minimum_reviews - config.total_outputs_reviewed
            message = (
                f"Need {remaining} more review(s) before autopilot eligibility. "
                f"You have reviewed {config.total_outputs_reviewed} of "
                f"{config.required_minimum_reviews} required outputs."
            )
        elif not high_enough_rate:
            message = (
                f"Approval rate is {config.approval_rate:.1%}, but "
                f"{config.required_approval_rate:.1%} is required. "
                f"Review and approve more outputs without edits to increase your rate."
            )
        else:
            message = (
                f"Eligible for autopilot! Approval rate: {config.approval_rate:.1%} "
                f"({config.approved_without_edit}/{config.total_outputs_reviewed} "
                f"approved without edits)."
            )

        return {
            "eligible": eligible,
            "current_approval_rate": config.approval_rate,
            "required_approval_rate": config.required_approval_rate,
            "reviews_completed": config.total_outputs_reviewed,
            "reviews_required": config.required_minimum_reviews,
            "message": message,
        }

    # ------------------------------------------------------------------
    # Enable / Disable
    # ------------------------------------------------------------------

    async def enable_autopilot(
        self, db: AsyncSession, workspace_id: UUID, platform_id: str
    ) -> AutopilotConfig:
        """Enable autopilot for a platform. Validates eligibility first."""
        eligibility = await self.check_eligibility(db, workspace_id, platform_id)

        if not eligibility["eligible"]:
            raise ValidationError(
                message="Not eligible for autopilot",
                detail=eligibility["message"],
            )

        config = await self.get_config(db, workspace_id, platform_id)
        config.enabled = True
        config.enabled_at = datetime.now(timezone.utc)
        config.disabled_at = None

        await db.flush()
        await db.refresh(config)

        logger.info(
            "Autopilot enabled for workspace=%s platform=%s (rate=%.1f%%)",
            workspace_id,
            platform_id,
            config.approval_rate * 100,
        )
        return config

    async def disable_autopilot(
        self, db: AsyncSession, workspace_id: UUID, platform_id: str
    ) -> AutopilotConfig:
        """Disable autopilot for a platform (instant, no confirmation needed)."""
        config = await self.get_config(db, workspace_id, platform_id)
        config.enabled = False
        config.disabled_at = datetime.now(timezone.utc)

        await db.flush()
        await db.refresh(config)

        logger.info(
            "Autopilot disabled for workspace=%s platform=%s",
            workspace_id,
            platform_id,
        )
        return config

    # ------------------------------------------------------------------
    # Threshold Management
    # ------------------------------------------------------------------

    async def update_thresholds(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        platform_id: str,
        required_rate: float | None = None,
        minimum_reviews: int | None = None,
    ) -> AutopilotConfig:
        """Update autopilot thresholds."""
        config = await self.get_config(db, workspace_id, platform_id)

        if required_rate is not None:
            config.required_approval_rate = required_rate
        if minimum_reviews is not None:
            config.required_minimum_reviews = minimum_reviews

        # If autopilot is enabled and the new thresholds make it ineligible,
        # automatically disable it
        if config.enabled:
            enough_reviews = config.total_outputs_reviewed >= config.required_minimum_reviews
            high_enough_rate = config.approval_rate >= config.required_approval_rate
            if not (enough_reviews and high_enough_rate):
                config.enabled = False
                config.disabled_at = datetime.now(timezone.utc)
                logger.warning(
                    "Autopilot auto-disabled for workspace=%s platform=%s due to threshold change",
                    workspace_id,
                    platform_id,
                )

        await db.flush()
        await db.refresh(config)
        return config

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    async def get_autopilot_summary(
        self, db: AsyncSession, workspace_id: UUID
    ) -> dict:
        """Summary of autopilot status across all platforms.

        Returns:
            {
                total_platforms: int,
                autopilot_enabled: int,
                eligible_not_enabled: int,
                not_eligible: int,
                total_auto_published: int,
                platforms: [{platform_id, platform_name, enabled, eligible,
                            approval_rate, auto_publish_count, status}]
            }
        """
        configs = await self.get_all_configs(db, workspace_id)

        platforms_list = []
        autopilot_enabled = 0
        eligible_not_enabled = 0
        not_eligible = 0
        total_auto_published = 0

        for config in configs:
            profile = get_platform(config.platform_id)
            platform_name = profile.name if profile else config.platform_id

            eligibility = await self.check_eligibility(
                db, workspace_id, config.platform_id
            )
            eligible = eligibility["eligible"]

            if config.enabled:
                status = "active"
                autopilot_enabled += 1
            elif eligible:
                status = "eligible"
                eligible_not_enabled += 1
            elif config.total_outputs_reviewed > 0:
                status = "building_trust"
                not_eligible += 1
            else:
                status = "not_started"
                not_eligible += 1

            total_auto_published += config.auto_publish_count

            platforms_list.append({
                "platform_id": config.platform_id,
                "platform_name": platform_name,
                "enabled": config.enabled,
                "eligible": eligible,
                "approval_rate": config.approval_rate,
                "auto_publish_count": config.auto_publish_count,
                "status": status,
            })

        return {
            "total_platforms": len(configs),
            "autopilot_enabled": autopilot_enabled,
            "eligible_not_enabled": eligible_not_enabled,
            "not_eligible": not_eligible,
            "total_auto_published": total_auto_published,
            "platforms": platforms_list,
        }

    # ------------------------------------------------------------------
    # Auto-publish Queue Processing
    # ------------------------------------------------------------------

    async def process_autopilot_queue(
        self, db: AsyncSession, workspace_id: UUID
    ) -> list[dict]:
        """Process outputs that should be auto-published.

        For platforms with autopilot enabled:
        1. Find approved outputs that haven't been scheduled
        2. Auto-schedule them using the scheduler
        Returns list of auto-scheduled items.
        """
        from app.models.calendar import ScheduledEvent
        from app.services.scheduler import SchedulerService

        configs = await self.get_all_configs(db, workspace_id)
        enabled_configs = [c for c in configs if c.enabled]

        if not enabled_configs:
            return []

        scheduler = SchedulerService()
        auto_scheduled = []

        for config in enabled_configs:
            # Find approved outputs for this platform that are NOT already scheduled
            result = await db.execute(
                select(GeneratedOutput)
                .where(
                    GeneratedOutput.platform_id == config.platform_id,
                    GeneratedOutput.status == "approved",
                )
            )
            approved_outputs = list(result.scalars().all())

            if not approved_outputs:
                continue

            # Filter out outputs that already have a scheduled event
            for output in approved_outputs:
                existing_event = await db.execute(
                    select(ScheduledEvent).where(
                        ScheduledEvent.generated_output_id == output.id,
                        ScheduledEvent.status.in_(["scheduled", "publishing", "published"]),
                    )
                )
                if existing_event.scalar_one_or_none():
                    continue

                # Create a distribution arc for this single output
                arc = scheduler.create_distribution_arc(
                    [output], datetime.now(timezone.utc)
                )

                if arc:
                    try:
                        event = await scheduler.schedule_output(
                            db=db,
                            workspace_id=workspace_id,
                            output_id=output.id,
                            scheduled_at=arc[0]["suggested_datetime"],
                            priority=5,  # Autopilot priority
                        )
                        config.auto_publish_count += 1
                        config.last_auto_published_at = datetime.now(timezone.utc)

                        auto_scheduled.append({
                            "output_id": str(output.id),
                            "platform_id": config.platform_id,
                            "scheduled_at": arc[0]["suggested_datetime"].isoformat(),
                            "event_id": str(event.id),
                        })
                    except (NotFoundError, ValidationError) as e:
                        logger.warning(
                            "Skipping auto-schedule for output %s: %s",
                            output.id,
                            e.message,
                        )
                        continue

        if auto_scheduled:
            await db.flush()

        return auto_scheduled
