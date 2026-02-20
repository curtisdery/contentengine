"""Analytics service — engagement tracking, Multiplier Score, and performance insights."""

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select, and_, case, extract, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analytics import AnalyticsSnapshot, MultiplierScore
from app.models.calendar import ScheduledEvent
from app.models.content import ContentUpload, GeneratedOutput
from app.platforms.profiles import get_platform, get_all_platforms

logger = logging.getLogger(__name__)


class AnalyticsService:
    """Handles analytics snapshots, Multiplier Score calculation, and performance insights."""

    # -----------------------------------------------------------------------
    # Snapshot Management
    # -----------------------------------------------------------------------

    async def record_snapshot(
        self,
        db: AsyncSession,
        output_id: UUID,
        workspace_id: UUID,
        metrics: dict,
    ) -> AnalyticsSnapshot:
        """Record a point-in-time analytics snapshot for a published output."""
        # Look up the output to get platform_id
        result = await db.execute(
            select(GeneratedOutput).where(GeneratedOutput.id == output_id)
        )
        output = result.scalar_one_or_none()
        platform_id = output.platform_id if output else "unknown"

        snapshot = AnalyticsSnapshot(
            generated_output_id=output_id,
            workspace_id=workspace_id,
            platform_id=platform_id,
            snapshot_time=datetime.now(timezone.utc),
            impressions=metrics.get("impressions", 0),
            engagements=metrics.get("engagements", 0),
            engagement_rate=metrics.get("engagement_rate", 0.0),
            saves_bookmarks=metrics.get("saves_bookmarks", 0),
            shares_reposts=metrics.get("shares_reposts", 0),
            comments=metrics.get("comments", 0),
            clicks=metrics.get("clicks", 0),
            follows_gained=metrics.get("follows_gained", 0),
            platform_specific=metrics.get("platform_specific"),
        )
        db.add(snapshot)
        await db.flush()
        await db.refresh(snapshot)
        return snapshot

    async def get_latest_snapshot(
        self,
        db: AsyncSession,
        output_id: UUID,
    ) -> AnalyticsSnapshot | None:
        """Get the most recent snapshot for an output."""
        result = await db.execute(
            select(AnalyticsSnapshot)
            .where(AnalyticsSnapshot.generated_output_id == output_id)
            .order_by(AnalyticsSnapshot.snapshot_time.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_snapshots_timeseries(
        self,
        db: AsyncSession,
        output_id: UUID,
        start: datetime,
        end: datetime,
    ) -> list[AnalyticsSnapshot]:
        """Get all snapshots in a range for time-series charting."""
        result = await db.execute(
            select(AnalyticsSnapshot)
            .where(
                AnalyticsSnapshot.generated_output_id == output_id,
                AnalyticsSnapshot.snapshot_time >= start,
                AnalyticsSnapshot.snapshot_time <= end,
            )
            .order_by(AnalyticsSnapshot.snapshot_time.asc())
        )
        return list(result.scalars().all())

    # -----------------------------------------------------------------------
    # Multiplier Score
    # -----------------------------------------------------------------------

    async def calculate_multiplier_score(
        self,
        db: AsyncSession,
        content_upload_id: UUID,
        workspace_id: UUID,
    ) -> MultiplierScore:
        """Calculate and cache the Multiplier Score for a content piece.

        Formula:
        1. Get all GeneratedOutputs for this content that have status=published
        2. For each, get the latest AnalyticsSnapshot
        3. Sum total_reach across all platforms
        4. Estimate original_reach (the best single platform as baseline)
        5. multiplier_value = total_reach / max(original_reach, 1)
        6. Build platform_breakdown with per-platform stats
        7. Identify best_platform
        8. Save/update MultiplierScore record
        """
        # Step 1: Get all published outputs for this content
        result = await db.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_upload_id,
                GeneratedOutput.status == "published",
            )
        )
        published_outputs = list(result.scalars().all())

        platform_breakdown = []
        total_reach = 0
        total_engagements = 0
        best_platform_id = None
        best_platform_reach = 0

        # Step 2 & 3: For each published output, get latest snapshot and aggregate
        for output in published_outputs:
            snapshot = await self.get_latest_snapshot(db, output.id)
            if snapshot:
                reach = snapshot.impressions
                engagements = snapshot.engagements
                eng_rate = snapshot.engagement_rate
            else:
                reach = 0
                engagements = 0
                eng_rate = 0.0

            total_reach += reach
            total_engagements += engagements

            platform_name = output.platform_id
            profile = get_platform(output.platform_id)
            if profile:
                platform_name = profile.name

            platform_breakdown.append({
                "platform_id": output.platform_id,
                "platform_name": platform_name,
                "reach": reach,
                "engagements": engagements,
                "engagement_rate": round(eng_rate, 4),
            })

            # Step 7: Track best performer
            if reach > best_platform_reach:
                best_platform_reach = reach
                best_platform_id = output.platform_id

        platforms_published = len(published_outputs)

        # Step 4: Estimate original_reach
        # Use the best-performing single platform as the baseline for "what
        # you'd have gotten with just one platform"
        original_reach = best_platform_reach if best_platform_reach > 0 else 1

        # Step 5: Calculate multiplier_value
        if total_reach > 0 and original_reach > 0:
            multiplier_value = round(total_reach / original_reach, 1)
        else:
            multiplier_value = 1.0

        now = datetime.now(timezone.utc)

        # Step 8: Save/update MultiplierScore record
        result = await db.execute(
            select(MultiplierScore).where(
                MultiplierScore.content_upload_id == content_upload_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.multiplier_value = multiplier_value
            existing.original_reach = original_reach
            existing.total_reach = total_reach
            existing.total_engagements = total_engagements
            existing.platforms_published = platforms_published
            existing.platform_breakdown = platform_breakdown
            existing.best_platform_id = best_platform_id
            existing.best_platform_reach = best_platform_reach
            existing.calculated_at = now
            await db.flush()
            await db.refresh(existing)
            return existing
        else:
            score = MultiplierScore(
                content_upload_id=content_upload_id,
                workspace_id=workspace_id,
                multiplier_value=multiplier_value,
                original_reach=original_reach,
                total_reach=total_reach,
                total_engagements=total_engagements,
                platforms_published=platforms_published,
                platform_breakdown=platform_breakdown,
                best_platform_id=best_platform_id,
                best_platform_reach=best_platform_reach,
                calculated_at=now,
            )
            db.add(score)
            await db.flush()
            await db.refresh(score)
            return score

    async def get_multiplier_score(
        self,
        db: AsyncSession,
        content_upload_id: UUID,
    ) -> MultiplierScore | None:
        """Get cached multiplier score."""
        result = await db.execute(
            select(MultiplierScore).where(
                MultiplierScore.content_upload_id == content_upload_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_workspace_multiplier_scores(
        self,
        db: AsyncSession,
        workspace_id: UUID,
    ) -> list[MultiplierScore]:
        """Get all multiplier scores for a workspace, ordered by multiplier_value desc."""
        result = await db.execute(
            select(MultiplierScore)
            .where(MultiplierScore.workspace_id == workspace_id)
            .order_by(MultiplierScore.multiplier_value.desc())
        )
        return list(result.scalars().all())

    # -----------------------------------------------------------------------
    # Performance Insights
    # -----------------------------------------------------------------------

    async def get_platform_performance(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        days: int = 30,
    ) -> list[dict]:
        """Aggregate performance per platform over a time period.

        Trend is calculated by comparing the last 7 days vs the previous 7 days.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Get the latest snapshot per output (to avoid double-counting from
        # multiple snapshots of the same output). We use a subquery to find
        # the max snapshot_time per output, then join back.
        latest_subq = (
            select(
                AnalyticsSnapshot.generated_output_id,
                func.max(AnalyticsSnapshot.snapshot_time).label("max_time"),
            )
            .where(
                AnalyticsSnapshot.workspace_id == workspace_id,
                AnalyticsSnapshot.snapshot_time >= cutoff,
            )
            .group_by(AnalyticsSnapshot.generated_output_id)
            .subquery()
        )

        result = await db.execute(
            select(AnalyticsSnapshot)
            .join(
                latest_subq,
                and_(
                    AnalyticsSnapshot.generated_output_id == latest_subq.c.generated_output_id,
                    AnalyticsSnapshot.snapshot_time == latest_subq.c.max_time,
                ),
            )
            .where(AnalyticsSnapshot.workspace_id == workspace_id)
        )
        snapshots = list(result.scalars().all())

        # Aggregate by platform_id
        platform_data: dict[str, dict] = {}
        for snap in snapshots:
            pid = snap.platform_id
            if pid not in platform_data:
                profile = get_platform(pid)
                platform_data[pid] = {
                    "platform_id": pid,
                    "platform_name": profile.name if profile else pid,
                    "total_impressions": 0,
                    "total_engagements": 0,
                    "engagement_rates": [],
                    "total_saves": 0,
                    "total_shares": 0,
                    "total_clicks": 0,
                    "total_follows": 0,
                    "post_count": 0,
                }
            d = platform_data[pid]
            d["total_impressions"] += snap.impressions
            d["total_engagements"] += snap.engagements
            d["engagement_rates"].append(snap.engagement_rate)
            d["total_saves"] += snap.saves_bookmarks
            d["total_shares"] += snap.shares_reposts
            d["total_clicks"] += snap.clicks
            d["total_follows"] += snap.follows_gained
            d["post_count"] += 1

        # Calculate trend for each platform
        now = datetime.now(timezone.utc)
        recent_start = now - timedelta(days=7)
        previous_start = now - timedelta(days=14)

        results = []
        for pid, d in platform_data.items():
            avg_rate = (
                sum(d["engagement_rates"]) / len(d["engagement_rates"])
                if d["engagement_rates"]
                else 0.0
            )

            # Trend: compare last 7 days avg engagement rate vs previous 7 days
            trend = await self._calculate_trend(
                db, workspace_id, pid, recent_start, previous_start, now
            )

            results.append({
                "platform_id": d["platform_id"],
                "platform_name": d["platform_name"],
                "total_impressions": d["total_impressions"],
                "total_engagements": d["total_engagements"],
                "avg_engagement_rate": round(avg_rate, 4),
                "total_saves": d["total_saves"],
                "total_shares": d["total_shares"],
                "total_clicks": d["total_clicks"],
                "total_follows": d["total_follows"],
                "post_count": d["post_count"],
                "trend": trend,
            })

        # Sort by total_engagements descending
        results.sort(key=lambda x: x["total_engagements"], reverse=True)
        return results

    async def _calculate_trend(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        platform_id: str,
        recent_start: datetime,
        previous_start: datetime,
        now: datetime,
    ) -> str:
        """Calculate trend by comparing recent 7 days vs previous 7 days."""
        # Recent period
        recent_result = await db.execute(
            select(func.avg(AnalyticsSnapshot.engagement_rate))
            .where(
                AnalyticsSnapshot.workspace_id == workspace_id,
                AnalyticsSnapshot.platform_id == platform_id,
                AnalyticsSnapshot.snapshot_time >= recent_start,
                AnalyticsSnapshot.snapshot_time <= now,
            )
        )
        recent_avg = recent_result.scalar() or 0.0

        # Previous period
        previous_result = await db.execute(
            select(func.avg(AnalyticsSnapshot.engagement_rate))
            .where(
                AnalyticsSnapshot.workspace_id == workspace_id,
                AnalyticsSnapshot.platform_id == platform_id,
                AnalyticsSnapshot.snapshot_time >= previous_start,
                AnalyticsSnapshot.snapshot_time < recent_start,
            )
        )
        previous_avg = previous_result.scalar() or 0.0

        if previous_avg == 0.0 and recent_avg == 0.0:
            return "stable"
        if previous_avg == 0.0:
            return "improving"

        change_pct = (recent_avg - previous_avg) / previous_avg
        if change_pct > 0.1:
            return "improving"
        elif change_pct < -0.1:
            return "declining"
        return "stable"

    async def get_content_type_performance(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        days: int = 30,
    ) -> list[dict]:
        """Performance breakdown by content type (blog, video_transcript, etc.)."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Join snapshots -> generated_outputs -> content_uploads to get content_type
        result = await db.execute(
            select(
                ContentUpload.content_type,
                func.avg(AnalyticsSnapshot.engagement_rate).label("avg_engagement_rate"),
                func.sum(AnalyticsSnapshot.impressions).label("total_reach"),
                func.count(distinct(AnalyticsSnapshot.generated_output_id)).label("post_count"),
            )
            .join(
                GeneratedOutput,
                GeneratedOutput.id == AnalyticsSnapshot.generated_output_id,
            )
            .join(
                ContentUpload,
                ContentUpload.id == GeneratedOutput.content_upload_id,
            )
            .where(
                AnalyticsSnapshot.workspace_id == workspace_id,
                AnalyticsSnapshot.snapshot_time >= cutoff,
            )
            .group_by(ContentUpload.content_type)
        )
        rows = result.all()

        results = []
        for row in rows:
            content_type = row[0]
            avg_eng = float(row[1]) if row[1] else 0.0
            total_reach = int(row[2]) if row[2] else 0
            post_count = int(row[3]) if row[3] else 0

            # Get avg multiplier score for this content type
            ms_result = await db.execute(
                select(func.avg(MultiplierScore.multiplier_value))
                .join(
                    ContentUpload,
                    ContentUpload.id == MultiplierScore.content_upload_id,
                )
                .where(
                    MultiplierScore.workspace_id == workspace_id,
                    ContentUpload.content_type == content_type,
                )
            )
            avg_multiplier = ms_result.scalar() or 0.0

            results.append({
                "content_type": content_type,
                "avg_engagement_rate": round(avg_eng, 4),
                "total_reach": total_reach,
                "post_count": post_count,
                "avg_multiplier_score": round(float(avg_multiplier), 1),
            })

        results.sort(key=lambda x: x["avg_engagement_rate"], reverse=True)
        return results

    async def get_hook_performance(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        days: int = 30,
    ) -> list[dict]:
        """Performance by hook type used in generated outputs.

        Hook type is stored in GeneratedOutput.metadata.hook_type (set during generation).
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # We need to query snapshots joined with outputs that have metadata->hook_type
        result = await db.execute(
            select(AnalyticsSnapshot, GeneratedOutput)
            .join(
                GeneratedOutput,
                GeneratedOutput.id == AnalyticsSnapshot.generated_output_id,
            )
            .where(
                AnalyticsSnapshot.workspace_id == workspace_id,
                AnalyticsSnapshot.snapshot_time >= cutoff,
            )
        )
        rows = result.all()

        hook_data: dict[str, dict] = {}
        for snap, output in rows:
            metadata = output.output_metadata or {}
            hook_type = metadata.get("hook_type", "unknown")

            if hook_type not in hook_data:
                hook_data[hook_type] = {
                    "hook_type": hook_type,
                    "engagement_rates": [],
                    "total_reach": 0,
                    "usage_count": 0,
                    "platform_engagements": defaultdict(float),
                }
            hd = hook_data[hook_type]
            hd["engagement_rates"].append(snap.engagement_rate)
            hd["total_reach"] += snap.impressions
            hd["usage_count"] += 1
            hd["platform_engagements"][snap.platform_id] += snap.engagement_rate

        results = []
        for hook_type, hd in hook_data.items():
            avg_rate = (
                sum(hd["engagement_rates"]) / len(hd["engagement_rates"])
                if hd["engagement_rates"]
                else 0.0
            )

            # Find best platform for this hook
            best_platform = None
            if hd["platform_engagements"]:
                best_pid = max(
                    hd["platform_engagements"],
                    key=hd["platform_engagements"].get,
                )
                profile = get_platform(best_pid)
                best_platform = profile.name if profile else best_pid

            results.append({
                "hook_type": hook_type,
                "avg_engagement_rate": round(avg_rate, 4),
                "total_reach": hd["total_reach"],
                "usage_count": hd["usage_count"],
                "best_platform_for_hook": best_platform,
            })

        results.sort(key=lambda x: x["avg_engagement_rate"], reverse=True)
        return results

    async def get_time_of_day_performance(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        days: int = 30,
    ) -> list[dict]:
        """Performance heatmap data by day of week and hour.

        Uses published_at from ScheduledEvent to determine when posts went live,
        cross-referenced with engagement data from snapshots.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Join scheduled events with snapshots to correlate publish time with engagement
        result = await db.execute(
            select(ScheduledEvent, AnalyticsSnapshot)
            .join(
                AnalyticsSnapshot,
                AnalyticsSnapshot.generated_output_id == ScheduledEvent.generated_output_id,
            )
            .where(
                ScheduledEvent.workspace_id == workspace_id,
                ScheduledEvent.status == "published",
                ScheduledEvent.published_at.isnot(None),
                ScheduledEvent.published_at >= cutoff,
            )
        )
        rows = result.all()

        # Build a grid: day_of_week (0-6) x hour (0-23)
        grid: dict[tuple[int, int], dict] = {}
        for day in range(7):
            for hour in range(24):
                grid[(day, hour)] = {
                    "day_of_week": day,
                    "hour": hour,
                    "engagement_rates": [],
                    "post_count": 0,
                }

        for event, snap in rows:
            published = event.published_at
            if published is None:
                continue
            # Monday=0, Sunday=6
            day_of_week = published.weekday()
            hour = published.hour
            key = (day_of_week, hour)
            if key in grid:
                grid[key]["engagement_rates"].append(snap.engagement_rate)
                grid[key]["post_count"] += 1

        results = []
        for key in sorted(grid.keys()):
            cell = grid[key]
            rates = cell["engagement_rates"]
            avg_rate = sum(rates) / len(rates) if rates else 0.0
            results.append({
                "day_of_week": cell["day_of_week"],
                "hour": cell["hour"],
                "avg_engagement_rate": round(avg_rate, 4),
                "post_count": cell["post_count"],
            })

        return results

    async def get_audience_intelligence(
        self,
        db: AsyncSession,
        workspace_id: UUID,
    ) -> dict:
        """Audience insights across platforms."""
        now = datetime.now(timezone.utc)
        last_30_days = now - timedelta(days=30)

        # Get per-platform aggregated data for the last 30 days
        result = await db.execute(
            select(
                AnalyticsSnapshot.platform_id,
                func.sum(AnalyticsSnapshot.follows_gained).label("total_follows"),
                func.avg(AnalyticsSnapshot.engagement_rate).label("avg_engagement"),
                func.count(AnalyticsSnapshot.id).label("snapshot_count"),
            )
            .where(
                AnalyticsSnapshot.workspace_id == workspace_id,
                AnalyticsSnapshot.snapshot_time >= last_30_days,
            )
            .group_by(AnalyticsSnapshot.platform_id)
        )
        rows = result.all()

        if not rows:
            return {
                "fastest_growing_platform": None,
                "best_engagement_platform": None,
                "platform_rankings": [],
                "recommendations": [
                    "Start publishing content to begin building audience insights."
                ],
            }

        platform_stats = []
        for row in rows:
            pid = row[0]
            total_follows = int(row[1]) if row[1] else 0
            avg_engagement = float(row[2]) if row[2] else 0.0
            snapshot_count = int(row[3]) if row[3] else 0

            profile = get_platform(pid)
            name = profile.name if profile else pid

            # Growth rate: follows gained per snapshot (normalized)
            growth_rate = total_follows / max(snapshot_count, 1)

            # Composite score: weighted combination of engagement and growth
            score = round(avg_engagement * 0.6 + growth_rate * 0.4, 4)

            platform_stats.append({
                "platform_id": pid,
                "name": name,
                "score": score,
                "follows_gained": total_follows,
                "engagement_rate": round(avg_engagement, 4),
                "growth_rate": round(growth_rate, 4),
            })

        # Sort by score descending
        platform_stats.sort(key=lambda x: x["score"], reverse=True)

        # Fastest growing by follows
        fastest_growing = max(
            platform_stats, key=lambda x: x["follows_gained"], default=None
        )

        # Best engagement
        best_engagement = max(
            platform_stats, key=lambda x: x["engagement_rate"], default=None
        )

        # Generate recommendations
        recommendations = []
        if best_engagement and len(platform_stats) > 1:
            # Compare best engagement platform vs average
            avg_all_engagement = sum(p["engagement_rate"] for p in platform_stats) / len(
                platform_stats
            )
            if best_engagement["engagement_rate"] > avg_all_engagement * 2:
                recommendations.append(
                    f"Double down on {best_engagement['name']} — "
                    f"{round(best_engagement['engagement_rate'] / max(avg_all_engagement, 0.0001), 1)}x "
                    f"engagement vs other platforms"
                )

        if fastest_growing and fastest_growing["follows_gained"] > 0:
            recommendations.append(
                f"{fastest_growing['name']} is your fastest-growing platform with "
                f"{fastest_growing['follows_gained']} new followers in 30 days"
            )

        # Find declining platforms
        for ps in platform_stats:
            if ps["engagement_rate"] < 0.01 and ps["follows_gained"] == 0:
                recommendations.append(
                    f"Consider refreshing your strategy on {ps['name']} — "
                    f"low engagement and no follower growth"
                )

        if not recommendations:
            recommendations.append(
                "Continue your current strategy — performance is consistent across platforms."
            )

        return {
            "fastest_growing_platform": {
                "platform_id": fastest_growing["platform_id"],
                "name": fastest_growing["name"],
                "growth_rate": fastest_growing["growth_rate"],
                "follows_gained": fastest_growing["follows_gained"],
            }
            if fastest_growing
            else None,
            "best_engagement_platform": {
                "platform_id": best_engagement["platform_id"],
                "name": best_engagement["name"],
                "avg_engagement_rate": best_engagement["engagement_rate"],
            }
            if best_engagement
            else None,
            "platform_rankings": platform_stats,
            "recommendations": recommendations,
        }

    async def get_content_strategy_suggestions(
        self,
        db: AsyncSession,
        workspace_id: UUID,
    ) -> list[dict]:
        """AI-free content strategy suggestions based on data patterns.

        Rules:
        - If a content_type consistently outperforms: suggest more of it
        - If a hook_type has 2x+ engagement: suggest using it more
        - If a platform's engagement is declining: suggest adjusting
        - If posting frequency is below optimal: suggest increasing
        """
        suggestions = []
        now = datetime.now(timezone.utc)

        # --- Content type performance ---
        content_type_perf = await self.get_content_type_performance(
            db, workspace_id, days=60
        )
        if len(content_type_perf) >= 2:
            avg_engagement = sum(
                ct["avg_engagement_rate"] for ct in content_type_perf
            ) / len(content_type_perf)

            for ct in content_type_perf:
                if ct["avg_engagement_rate"] > avg_engagement * 1.5 and ct["post_count"] >= 3:
                    suggestions.append({
                        "type": "topic",
                        "suggestion": (
                            f"Your '{ct['content_type']}' content consistently outperforms "
                            f"other types by {round(ct['avg_engagement_rate'] / max(avg_engagement, 0.0001), 1)}x. "
                            f"Consider creating more of this content type."
                        ),
                        "confidence": min(0.9, 0.5 + ct["post_count"] * 0.05),
                        "data_points": ct["post_count"],
                    })

        # --- Hook type performance ---
        hook_perf = await self.get_hook_performance(db, workspace_id, days=60)
        if len(hook_perf) >= 2:
            avg_hook_rate = sum(
                h["avg_engagement_rate"] for h in hook_perf
            ) / len(hook_perf)

            for h in hook_perf:
                if (
                    h["avg_engagement_rate"] > avg_hook_rate * 2
                    and h["usage_count"] >= 2
                    and h["hook_type"] != "unknown"
                ):
                    best_plat = h["best_platform_for_hook"]
                    plat_note = f", especially on {best_plat}" if best_plat else ""
                    suggestions.append({
                        "type": "format",
                        "suggestion": (
                            f"The '{h['hook_type']}' hook style has {round(h['avg_engagement_rate'] / max(avg_hook_rate, 0.0001), 1)}x "
                            f"more engagement than average. Use it more often{plat_note}."
                        ),
                        "confidence": min(0.85, 0.4 + h["usage_count"] * 0.1),
                        "data_points": h["usage_count"],
                    })

        # --- Platform trend detection ---
        platform_perf = await self.get_platform_performance(
            db, workspace_id, days=30
        )
        for pp in platform_perf:
            if pp["trend"] == "declining" and pp["post_count"] >= 3:
                suggestions.append({
                    "type": "platform",
                    "suggestion": (
                        f"Engagement on {pp['platform_name']} is declining. "
                        f"Consider adjusting your content format or posting time for this platform."
                    ),
                    "confidence": 0.6,
                    "data_points": pp["post_count"],
                })
            elif pp["trend"] == "improving" and pp["post_count"] >= 3:
                suggestions.append({
                    "type": "platform",
                    "suggestion": (
                        f"{pp['platform_name']} engagement is trending up — "
                        f"consider increasing your posting frequency here."
                    ),
                    "confidence": 0.7,
                    "data_points": pp["post_count"],
                })

        # --- Posting frequency analysis ---
        last_30_days = now - timedelta(days=30)
        post_count_result = await db.execute(
            select(func.count(ScheduledEvent.id))
            .where(
                ScheduledEvent.workspace_id == workspace_id,
                ScheduledEvent.status == "published",
                ScheduledEvent.published_at >= last_30_days,
            )
        )
        total_posts_30d = post_count_result.scalar() or 0

        # Check how many active platforms the workspace has
        active_platforms_result = await db.execute(
            select(func.count(distinct(ScheduledEvent.platform_id)))
            .where(
                ScheduledEvent.workspace_id == workspace_id,
                ScheduledEvent.status.in_(["scheduled", "published"]),
            )
        )
        active_platforms = active_platforms_result.scalar() or 0

        if active_platforms > 0:
            posts_per_platform = total_posts_30d / active_platforms
            if posts_per_platform < 4:  # Less than 1 per week per platform
                suggestions.append({
                    "type": "timing",
                    "suggestion": (
                        f"You're posting an average of {round(posts_per_platform, 1)} times "
                        f"per platform per month. Aim for at least 4-8 posts per platform "
                        f"monthly to maintain audience engagement."
                    ),
                    "confidence": 0.75,
                    "data_points": total_posts_30d,
                })

        if not suggestions:
            # Check if there is any data at all
            snapshot_count = await db.execute(
                select(func.count(AnalyticsSnapshot.id))
                .where(AnalyticsSnapshot.workspace_id == workspace_id)
            )
            count = snapshot_count.scalar() or 0
            if count == 0:
                suggestions.append({
                    "type": "topic",
                    "suggestion": (
                        "Start publishing content and tracking analytics to receive "
                        "data-driven strategy suggestions."
                    ),
                    "confidence": 1.0,
                    "data_points": 0,
                })

        # Sort by confidence descending
        suggestions.sort(key=lambda x: x["confidence"], reverse=True)
        return suggestions

    # -----------------------------------------------------------------------
    # Dashboard Aggregation
    # -----------------------------------------------------------------------

    async def get_dashboard_overview(
        self,
        db: AsyncSession,
        workspace_id: UUID,
    ) -> dict:
        """Main analytics dashboard data."""
        now = datetime.now(timezone.utc)
        last_30_days = now - timedelta(days=30)

        # Total content pieces
        content_count_result = await db.execute(
            select(func.count(ContentUpload.id))
            .where(ContentUpload.workspace_id == workspace_id)
        )
        total_content_pieces = content_count_result.scalar() or 0

        # Total outputs generated
        outputs_result = await db.execute(
            select(func.count(GeneratedOutput.id))
            .join(ContentUpload, ContentUpload.id == GeneratedOutput.content_upload_id)
            .where(ContentUpload.workspace_id == workspace_id)
        )
        total_outputs_generated = outputs_result.scalar() or 0

        # Total published
        published_result = await db.execute(
            select(func.count(GeneratedOutput.id))
            .join(ContentUpload, ContentUpload.id == GeneratedOutput.content_upload_id)
            .where(
                ContentUpload.workspace_id == workspace_id,
                GeneratedOutput.status == "published",
            )
        )
        total_published = published_result.scalar() or 0

        # Total reach and engagements (from latest snapshots per output)
        latest_subq = (
            select(
                AnalyticsSnapshot.generated_output_id,
                func.max(AnalyticsSnapshot.snapshot_time).label("max_time"),
            )
            .where(AnalyticsSnapshot.workspace_id == workspace_id)
            .group_by(AnalyticsSnapshot.generated_output_id)
            .subquery()
        )

        reach_result = await db.execute(
            select(
                func.coalesce(func.sum(AnalyticsSnapshot.impressions), 0),
                func.coalesce(func.sum(AnalyticsSnapshot.engagements), 0),
            )
            .join(
                latest_subq,
                and_(
                    AnalyticsSnapshot.generated_output_id == latest_subq.c.generated_output_id,
                    AnalyticsSnapshot.snapshot_time == latest_subq.c.max_time,
                ),
            )
            .where(AnalyticsSnapshot.workspace_id == workspace_id)
        )
        reach_row = reach_result.one()
        total_reach = int(reach_row[0])
        total_engagements = int(reach_row[1])

        # Multiplier scores
        ms_result = await db.execute(
            select(
                func.coalesce(func.avg(MultiplierScore.multiplier_value), 0.0),
                func.coalesce(func.max(MultiplierScore.multiplier_value), 0.0),
            )
            .where(MultiplierScore.workspace_id == workspace_id)
        )
        ms_row = ms_result.one()
        avg_multiplier_score = round(float(ms_row[0]), 1)
        best_multiplier_score = round(float(ms_row[1]), 1)

        # Platforms active (distinct platforms with published content)
        platforms_active_result = await db.execute(
            select(func.count(distinct(ScheduledEvent.platform_id)))
            .where(
                ScheduledEvent.workspace_id == workspace_id,
                ScheduledEvent.status.in_(["scheduled", "published"]),
            )
        )
        platforms_active = platforms_active_result.scalar() or 0

        # Top performing content (by multiplier value)
        top_content_result = await db.execute(
            select(MultiplierScore, ContentUpload.title)
            .join(
                ContentUpload,
                ContentUpload.id == MultiplierScore.content_upload_id,
            )
            .where(MultiplierScore.workspace_id == workspace_id)
            .order_by(MultiplierScore.multiplier_value.desc())
            .limit(5)
        )
        top_content_rows = top_content_result.all()
        top_performing_content = [
            {
                "content_id": str(ms.content_upload_id),
                "title": title,
                "multiplier_value": ms.multiplier_value,
                "total_reach": ms.total_reach,
            }
            for ms, title in top_content_rows
        ]

        # Recent performance — daily aggregation for the last 30 days
        recent_performance = []
        for day_offset in range(30):
            day_start = (now - timedelta(days=29 - day_offset)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            day_end = day_start + timedelta(days=1)

            day_result = await db.execute(
                select(
                    func.coalesce(func.sum(AnalyticsSnapshot.impressions), 0),
                    func.coalesce(func.sum(AnalyticsSnapshot.engagements), 0),
                )
                .where(
                    AnalyticsSnapshot.workspace_id == workspace_id,
                    AnalyticsSnapshot.snapshot_time >= day_start,
                    AnalyticsSnapshot.snapshot_time < day_end,
                )
            )
            day_row = day_result.one()
            recent_performance.append({
                "date": day_start.strftime("%Y-%m-%d"),
                "impressions": int(day_row[0]),
                "engagements": int(day_row[1]),
            })

        return {
            "total_content_pieces": total_content_pieces,
            "total_outputs_generated": total_outputs_generated,
            "total_published": total_published,
            "total_reach": total_reach,
            "total_engagements": total_engagements,
            "avg_multiplier_score": avg_multiplier_score,
            "best_multiplier_score": best_multiplier_score,
            "platforms_active": platforms_active,
            "top_performing_content": top_performing_content,
            "recent_performance": recent_performance,
        }
