"""A/B testing service — create and evaluate split tests on generated outputs."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.autopilot import ABTest
from app.models.content import GeneratedOutput
from app.models.analytics import AnalyticsSnapshot
from app.utils.exceptions import NotFoundError, ValidationError

logger = logging.getLogger(__name__)


class ABTestingService:
    """Manages A/B test creation, execution, and evaluation."""

    async def create_test(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        content_upload_id: UUID,
        platform_id: str,
        variant_a_id: UUID,
        variant_b_id: UUID,
    ) -> ABTest:
        """Create an A/B test between two output variants."""
        # Verify both variants exist
        for variant_id, label in [(variant_a_id, "A"), (variant_b_id, "B")]:
            result = await db.execute(
                select(GeneratedOutput).where(GeneratedOutput.id == variant_id)
            )
            output = result.scalar_one_or_none()
            if not output:
                raise NotFoundError(
                    message=f"Variant {label} not found",
                    detail=f"No generated output found with id {variant_id}",
                )

        # Ensure variants are different
        if variant_a_id == variant_b_id:
            raise ValidationError(
                message="Variants must be different",
                detail="variant_a_output_id and variant_b_output_id must refer to different outputs",
            )

        test = ABTest(
            workspace_id=workspace_id,
            content_upload_id=content_upload_id,
            platform_id=platform_id,
            variant_a_output_id=variant_a_id,
            variant_b_output_id=variant_b_id,
            status="pending",
        )
        db.add(test)
        await db.flush()
        await db.refresh(test)

        logger.info(
            "A/B test created: id=%s workspace=%s platform=%s",
            test.id,
            workspace_id,
            platform_id,
        )
        return test

    async def get_tests(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        status: str | None = None,
    ) -> list[ABTest]:
        """List A/B tests, optionally filtered by status."""
        query = (
            select(ABTest)
            .where(ABTest.workspace_id == workspace_id)
            .order_by(ABTest.created_at.desc())
        )

        if status:
            query = query.where(ABTest.status == status)

        result = await db.execute(query)
        return list(result.scalars().all())

    async def get_test(
        self, db: AsyncSession, test_id: UUID, workspace_id: UUID
    ) -> ABTest:
        """Get a single A/B test."""
        result = await db.execute(
            select(ABTest).where(
                ABTest.id == test_id,
                ABTest.workspace_id == workspace_id,
            )
        )
        test = result.scalar_one_or_none()
        if not test:
            raise NotFoundError(
                message="A/B test not found",
                detail=f"No A/B test found with id {test_id}",
            )
        return test

    async def start_test(
        self, db: AsyncSession, test_id: UUID, workspace_id: UUID
    ) -> ABTest:
        """Start an A/B test (schedule both variants)."""
        test = await self.get_test(db, test_id, workspace_id)

        if test.status != "pending":
            raise ValidationError(
                message="Cannot start test",
                detail=f"Test is in '{test.status}' status. Only 'pending' tests can be started.",
            )

        test.status = "running"
        test.started_at = datetime.now(timezone.utc)

        await db.flush()
        await db.refresh(test)

        logger.info("A/B test started: id=%s", test_id)
        return test

    async def evaluate_test(
        self, db: AsyncSession, test_id: UUID, workspace_id: UUID
    ) -> ABTest:
        """Evaluate test results. Compare metrics, declare winner.

        Winner = higher engagement_rate variant.
        """
        test = await self.get_test(db, test_id, workspace_id)

        if test.status != "running":
            raise ValidationError(
                message="Cannot evaluate test",
                detail=f"Test is in '{test.status}' status. Only 'running' tests can be evaluated.",
            )

        # Get latest metrics for variant A
        variant_a_metrics = await self._get_variant_metrics(db, test.variant_a_output_id)
        variant_b_metrics = await self._get_variant_metrics(db, test.variant_b_output_id)

        test.variant_a_metrics = variant_a_metrics
        test.variant_b_metrics = variant_b_metrics

        # Determine winner based on engagement_rate
        rate_a = variant_a_metrics.get("engagement_rate", 0.0)
        rate_b = variant_b_metrics.get("engagement_rate", 0.0)

        if rate_a > rate_b:
            test.winner_output_id = test.variant_a_output_id
        elif rate_b > rate_a:
            test.winner_output_id = test.variant_b_output_id
        else:
            # Tie — use impressions as tiebreaker
            impressions_a = variant_a_metrics.get("impressions", 0)
            impressions_b = variant_b_metrics.get("impressions", 0)
            if impressions_a >= impressions_b:
                test.winner_output_id = test.variant_a_output_id
            else:
                test.winner_output_id = test.variant_b_output_id

        test.status = "completed"
        test.completed_at = datetime.now(timezone.utc)

        await db.flush()
        await db.refresh(test)

        logger.info(
            "A/B test evaluated: id=%s winner=%s (A rate=%.4f, B rate=%.4f)",
            test_id,
            test.winner_output_id,
            rate_a,
            rate_b,
        )
        return test

    async def cancel_test(
        self, db: AsyncSession, test_id: UUID, workspace_id: UUID
    ) -> ABTest:
        """Cancel a running or pending test."""
        test = await self.get_test(db, test_id, workspace_id)

        if test.status in ("completed", "cancelled"):
            raise ValidationError(
                message="Cannot cancel test",
                detail=f"Test is in '{test.status}' status and cannot be cancelled.",
            )

        test.status = "cancelled"
        test.completed_at = datetime.now(timezone.utc)

        await db.flush()
        await db.refresh(test)

        logger.info("A/B test cancelled: id=%s", test_id)
        return test

    # ------------------------------------------------------------------
    # Internal Helpers
    # ------------------------------------------------------------------

    async def _get_variant_metrics(
        self, db: AsyncSession, output_id: UUID
    ) -> dict:
        """Get the latest analytics metrics for an output variant."""
        result = await db.execute(
            select(AnalyticsSnapshot)
            .where(AnalyticsSnapshot.generated_output_id == output_id)
            .order_by(AnalyticsSnapshot.snapshot_time.desc())
            .limit(1)
        )
        snapshot = result.scalar_one_or_none()

        if snapshot:
            return {
                "impressions": snapshot.impressions,
                "engagements": snapshot.engagements,
                "engagement_rate": snapshot.engagement_rate,
            }

        return {
            "impressions": 0,
            "engagements": 0,
            "engagement_rate": 0.0,
        }
