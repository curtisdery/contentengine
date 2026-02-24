"""Analytics API routes — Firestore-backed."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Path, Query

from app.core.firestore import get_db
from app.middleware.auth import get_current_user
from app.utils.exceptions import NotFoundError

router = APIRouter()

VALID_PERIODS = {"7d": 7, "30d": 30, "90d": 90}


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/overview?period=7d|30d|90d
# ---------------------------------------------------------------------------

@router.get("/overview")
async def get_overview(
    period: str = Query("30d", description="Time period: 7d, 30d, or 90d"),
    current_user=Depends(get_current_user),
) -> dict:
    """Dashboard overview — aggregate metrics across all platforms."""
    days = VALID_PERIODS.get(period, 30)
    db = get_db()
    user_id = current_user.id
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    # Published posts in period
    published_query = (
        db.collection("scheduled_posts")
        .where("user_id", "==", user_id)
        .where("status", "==", "published")
    )
    posts = []
    async for doc in published_query.stream():
        data = doc.to_dict()
        published_at = data.get("published_at")
        if published_at and published_at >= cutoff:
            posts.append({**data, "id": doc.id})

    total_posts = len(posts)
    total_impressions = 0
    total_engagements = 0
    platform_counts: dict[str, int] = defaultdict(int)

    for post in posts:
        total_impressions += post.get("latest_impressions", 0)
        total_engagements += post.get("latest_engagements", 0)
        platform_counts[post.get("platform", "unknown")] += 1

    avg_engagement_rate = (
        round(total_engagements / max(total_impressions, 1), 4)
        if total_impressions > 0 else 0.0
    )

    # Multiplier score summary
    scores_query = (
        db.collection("multiplier_scores")
        .where("user_id", "==", user_id)
    )
    multiplier_values = []
    async for doc in scores_query.stream():
        val = doc.to_dict().get("multiplier_value", 1.0)
        multiplier_values.append(val)

    avg_multiplier = round(sum(multiplier_values) / max(len(multiplier_values), 1), 1)
    best_multiplier = round(max(multiplier_values, default=1.0), 1)

    # Top 5 performing posts by impressions
    top_posts = sorted(posts, key=lambda p: p.get("latest_impressions", 0), reverse=True)[:5]
    top_performing = [
        {
            "event_id": p["id"],
            "platform": p.get("platform", ""),
            "impressions": p.get("latest_impressions", 0),
            "engagements": p.get("latest_engagements", 0),
            "published_at": p.get("published_at"),
        }
        for p in top_posts
    ]

    return {
        "period": period,
        "total_posts_published": total_posts,
        "total_impressions": total_impressions,
        "total_engagements": total_engagements,
        "avg_engagement_rate": avg_engagement_rate,
        "platforms_active": len(platform_counts),
        "platform_breakdown": dict(platform_counts),
        "avg_multiplier": avg_multiplier,
        "best_multiplier": best_multiplier,
        "top_performing": top_performing,
    }


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/content/{upload_id}
# ---------------------------------------------------------------------------

@router.get("/content/{upload_id}")
async def get_content_analytics(
    upload_id: str = Path(..., description="Content upload ID"),
    current_user=Depends(get_current_user),
) -> dict:
    """Analytics for a single content piece — multiplier score + per-output breakdown."""
    db = get_db()
    user_id = current_user.id

    # Verify content belongs to user
    content_doc = await db.collection("content_uploads").document(upload_id).get()
    if not content_doc.exists:
        raise NotFoundError(message="Content not found", detail=f"No content with id {upload_id}")
    content = content_doc.to_dict()
    if content.get("user_id") != user_id:
        raise NotFoundError(message="Content not found", detail=f"No content with id {upload_id}")

    # Load multiplier score
    score_doc = await db.collection("multiplier_scores").document(upload_id).get()
    multiplier = None
    if score_doc.exists:
        multiplier = score_doc.to_dict()

    # Load all outputs for this content
    outputs_query = (
        db.collection("generated_outputs")
        .where("content_upload_id", "==", upload_id)
    )
    outputs = []
    async for doc in outputs_query.stream():
        outputs.append({**doc.to_dict(), "id": doc.id})

    # For each published output, find its scheduled post and latest metrics
    output_analytics = []
    for output in outputs:
        output_entry = {
            "output_id": output["id"],
            "platform": output.get("platform", ""),
            "format_name": output.get("format_name", ""),
            "status": output.get("status", ""),
            "impressions": 0,
            "engagements": 0,
            "engagement_rate": 0.0,
            "snapshots": [],
        }

        if output.get("status") == "published":
            # Find the scheduled post for this output
            event_query = (
                db.collection("scheduled_posts")
                .where("output_id", "==", output["id"])
                .where("status", "==", "published")
                .limit(1)
            )
            events = [d async for d in event_query.stream()]
            if events:
                event_data = events[0].to_dict()
                output_entry["impressions"] = event_data.get("latest_impressions", 0)
                output_entry["engagements"] = event_data.get("latest_engagements", 0)
                output_entry["engagement_rate"] = event_data.get("latest_engagement_rate", 0.0)

                # Load snapshot history for time-series
                snap_query = (
                    db.collection("post_analytics")
                    .where("scheduled_post_id", "==", events[0].id)
                    .order_by("measured_at")
                )
                async for snap_doc in snap_query.stream():
                    snap = snap_doc.to_dict()
                    output_entry["snapshots"].append({
                        "measured_at": snap.get("measured_at"),
                        "impressions": snap.get("impressions", 0),
                        "engagements": snap.get("engagements", 0),
                        "engagement_rate": snap.get("engagement_rate", 0.0),
                    })

        output_analytics.append(output_entry)

    return {
        "content_upload_id": upload_id,
        "title": content.get("title", ""),
        "multiplier": multiplier,
        "outputs": output_analytics,
        "total_outputs": len(outputs),
        "published_outputs": sum(1 for o in outputs if o.get("status") == "published"),
    }


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/platform/{platform}
# ---------------------------------------------------------------------------

@router.get("/platform/{platform}")
async def get_platform_analytics(
    platform: str = Path(..., description="Platform ID (e.g. twitter, linkedin)"),
    period: str = Query("30d", description="Time period: 7d, 30d, or 90d"),
    current_user=Depends(get_current_user),
) -> dict:
    """Analytics for a single platform — aggregated metrics + time series."""
    days = VALID_PERIODS.get(period, 30)
    db = get_db()
    user_id = current_user.id
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    # Published posts on this platform
    published_query = (
        db.collection("scheduled_posts")
        .where("user_id", "==", user_id)
        .where("platform", "==", platform)
        .where("status", "==", "published")
    )

    posts = []
    async for doc in published_query.stream():
        data = doc.to_dict()
        published_at = data.get("published_at")
        if published_at and published_at >= cutoff:
            posts.append({**data, "id": doc.id})

    total_impressions = sum(p.get("latest_impressions", 0) for p in posts)
    total_engagements = sum(p.get("latest_engagements", 0) for p in posts)
    avg_engagement_rate = (
        round(total_engagements / max(total_impressions, 1), 4)
        if total_impressions > 0 else 0.0
    )

    # Load all snapshots for these posts for time-series
    daily_metrics: dict[str, dict] = defaultdict(lambda: {"impressions": 0, "engagements": 0, "count": 0})

    for post in posts:
        snap_query = (
            db.collection("post_analytics")
            .where("scheduled_post_id", "==", post["id"])
            .order_by("measured_at")
        )
        async for snap_doc in snap_query.stream():
            snap = snap_doc.to_dict()
            measured_at = snap.get("measured_at")
            if measured_at and measured_at >= cutoff:
                day_key = measured_at.strftime("%Y-%m-%d")
                daily_metrics[day_key]["impressions"] += snap.get("impressions", 0)
                daily_metrics[day_key]["engagements"] += snap.get("engagements", 0)
                daily_metrics[day_key]["count"] += 1

    time_series = [
        {"date": k, **v}
        for k, v in sorted(daily_metrics.items())
    ]

    # Top posts on this platform
    top_posts = sorted(posts, key=lambda p: p.get("latest_impressions", 0), reverse=True)[:10]
    top_performing = [
        {
            "event_id": p["id"],
            "impressions": p.get("latest_impressions", 0),
            "engagements": p.get("latest_engagements", 0),
            "published_at": p.get("published_at"),
        }
        for p in top_posts
    ]

    return {
        "platform": platform,
        "period": period,
        "total_posts": len(posts),
        "total_impressions": total_impressions,
        "total_engagements": total_engagements,
        "avg_engagement_rate": avg_engagement_rate,
        "time_series": time_series,
        "top_performing": top_performing,
    }


# ---------------------------------------------------------------------------
# GET /api/v1/analytics/heatmap/{platform}
# ---------------------------------------------------------------------------

@router.get("/heatmap/{platform}")
async def get_heatmap(
    platform: str = Path(..., description="Platform ID (e.g. twitter, linkedin)"),
    period: str = Query("30d", description="Time period: 7d, 30d, or 90d"),
    current_user=Depends(get_current_user),
) -> dict:
    """Day-of-week / hour-of-day engagement heatmap for a platform."""
    days = VALID_PERIODS.get(period, 30)
    db = get_db()
    user_id = current_user.id
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    # Published posts on this platform
    published_query = (
        db.collection("scheduled_posts")
        .where("user_id", "==", user_id)
        .where("platform", "==", platform)
        .where("status", "==", "published")
    )

    # Collect (day_of_week, hour) → engagement data
    # day_of_week: 0=Mon, 6=Sun; hour: 0-23 UTC
    heatmap_cells: dict[tuple[int, int], dict] = defaultdict(
        lambda: {"impressions": 0, "engagements": 0, "posts": 0}
    )

    async for doc in published_query.stream():
        data = doc.to_dict()
        published_at = data.get("published_at")
        if not published_at or published_at < cutoff:
            continue

        day = published_at.weekday()  # 0=Mon
        hour = published_at.hour
        cell = heatmap_cells[(day, hour)]
        cell["impressions"] += data.get("latest_impressions", 0)
        cell["engagements"] += data.get("latest_engagements", 0)
        cell["posts"] += 1

    heatmap = []
    for (day, hour), cell in sorted(heatmap_cells.items()):
        eng_rate = round(cell["engagements"] / max(cell["impressions"], 1), 4) if cell["impressions"] > 0 else 0.0
        heatmap.append({
            "day_of_week": day,
            "hour": hour,
            "impressions": cell["impressions"],
            "engagements": cell["engagements"],
            "engagement_rate": eng_rate,
            "post_count": cell["posts"],
        })

    return {
        "platform": platform,
        "period": period,
        "heatmap": heatmap,
    }
