"""Tests for Firestore-backed analytics polling, milestones, and dashboard."""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.v1.internal import (
    MILESTONES,
    POLL_INTERVALS_SECONDS,
    _check_milestones,
    _format_number,
)
from app.services.fetchers.base import NormalizedMetrics


# ---------------------------------------------------------------------------
# Helpers — fake Firestore document / async stream
# ---------------------------------------------------------------------------

def _make_doc(doc_id: str, data: dict, *, exists: bool = True):
    doc = MagicMock()
    doc.id = doc_id
    doc.exists = exists
    doc.to_dict.return_value = data
    return doc


def _doc_ref(doc_snapshot):
    ref = MagicMock()
    ref.get = AsyncMock(return_value=doc_snapshot)
    ref.update = AsyncMock()
    ref.set = AsyncMock()
    return ref


def _collection_with_docs(*docs):
    async def fake_stream():
        for d in docs:
            yield d

    query = MagicMock()
    query.stream = fake_stream
    query.where = MagicMock(return_value=query)
    query.limit = MagicMock(return_value=query)
    query.order_by = MagicMock(return_value=query)
    return query


def _empty_stream():
    async def fake_stream():
        return
        yield

    query = MagicMock()
    query.stream = fake_stream
    query.where = MagicMock(return_value=query)
    query.limit = MagicMock(return_value=query)
    query.order_by = MagicMock(return_value=query)
    return query


def _fake_user(user_id="user_1"):
    return MagicMock(id=user_id)


NOW = datetime(2026, 2, 23, 14, 0, 0, tzinfo=timezone.utc)

PUBLISHED_EVENT = {
    "user_id": "user_1",
    "output_id": "output_1",
    "platform": "twitter",
    "status": "published",
    "platform_post_id": "tweet_999",
    "published_at": NOW - timedelta(hours=1),
    "latest_impressions": 0,
    "latest_engagements": 0,
}

CONN_DATA = {
    "platform": "twitter",
    "user_id": "user_1",
    "is_active": True,
    "access_token_encrypted": "enc_token",
}

SAMPLE_METRICS = NormalizedMetrics(
    impressions=1500,
    engagements=75,
    engagement_rate=0.05,
    saves_bookmarks=10,
    shares_reposts=20,
    comments=15,
    clicks=30,
    follows_gained=0,
    platform_specific={"likes": 40, "retweets": 20, "replies": 15},
)


def _build_poll_db(event_data=None, conn_data=None):
    """Build a mock db for poll-single-post tests."""
    event_data = event_data or PUBLISHED_EVENT
    conn_data = conn_data or CONN_DATA

    event_doc = _make_doc("event_1", event_data)
    event_ref = _doc_ref(event_doc)

    conn_doc = _make_doc("conn_1", conn_data)
    conn_stream = _collection_with_docs(conn_doc)

    # For milestone checks — no existing milestones
    milestone_missing = _make_doc("", {}, exists=False)
    milestone_ref = _doc_ref(milestone_missing)

    add_tracker = AsyncMock(return_value=(None, MagicMock(id="snap_new")))

    db = MagicMock()

    def route_collection(name):
        coll = MagicMock()
        if name == "scheduled_posts":
            coll.document.return_value = event_ref
            return coll
        elif name == "connected_platforms":
            coll.where.return_value = conn_stream
            return coll
        elif name == "post_analytics":
            coll.add = add_tracker
            return coll
        elif name == "milestones":
            coll.document.return_value = milestone_ref
            return coll
        elif name == "notifications":
            coll.add = AsyncMock()
            return coll
        return coll

    db.collection.side_effect = route_collection
    return db, event_ref, add_tracker


# ---------------------------------------------------------------------------
# 1. test_poll_stores_analytics
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_poll_stores_analytics():
    """poll-single-post fetches metrics and writes a post_analytics doc."""
    from app.api.v1.internal import poll_single_post

    db, event_ref, add_tracker = _build_poll_db()

    request = MagicMock()
    request.json = AsyncMock(return_value={"event_id": "event_1", "poll_index": 0})

    with patch("app.api.v1.internal.get_db", return_value=db), \
         patch("app.api.v1.internal.decrypt", return_value="real_token"), \
         patch("app.api.v1.internal.get_fetcher") as mock_gf, \
         patch("app.api.v1.internal.enqueue_task", new_callable=AsyncMock):
        mock_fetcher = MagicMock()
        mock_fetcher.fetch = AsyncMock(return_value=SAMPLE_METRICS)
        mock_gf.return_value = mock_fetcher

        result = await poll_single_post(request)

    assert result["status"] == "recorded"
    assert result["impressions"] == 1500
    assert result["engagements"] == 75

    # Verify post_analytics.add was called with correct data
    add_tracker.assert_called_once()
    stored = add_tracker.call_args[0][0]
    assert stored["impressions"] == 1500
    assert stored["engagements"] == 75
    assert stored["scheduled_post_id"] == "event_1"
    assert stored["platform"] == "twitter"
    assert stored["poll_index"] == 0

    # Verify event was updated with latest metrics
    event_ref.update.assert_called_once()
    update_data = event_ref.update.call_args[0][0]
    assert update_data["latest_impressions"] == 1500
    assert update_data["latest_engagements"] == 75


# ---------------------------------------------------------------------------
# 2. test_poll_normalizes_correctly
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_poll_normalizes_correctly():
    """NormalizedMetrics.to_dict() produces correct keys and the poll stores them all."""
    from app.api.v1.internal import poll_single_post

    rich_metrics = NormalizedMetrics(
        impressions=50000,
        engagements=2500,
        engagement_rate=0.05,
        saves_bookmarks=300,
        shares_reposts=400,
        comments=200,
        clicks=1000,
        follows_gained=50,
        platform_specific={"views": 50000, "likes": 1500},
    )

    db, event_ref, add_tracker = _build_poll_db()

    request = MagicMock()
    request.json = AsyncMock(return_value={"event_id": "event_1", "poll_index": 2})

    with patch("app.api.v1.internal.get_db", return_value=db), \
         patch("app.api.v1.internal.decrypt", return_value="tok"), \
         patch("app.api.v1.internal.get_fetcher") as mock_gf, \
         patch("app.api.v1.internal.enqueue_task", new_callable=AsyncMock):
        mock_fetcher = MagicMock()
        mock_fetcher.fetch = AsyncMock(return_value=rich_metrics)
        mock_gf.return_value = mock_fetcher

        result = await poll_single_post(request)

    assert result["status"] == "recorded"

    stored = add_tracker.call_args[0][0]
    assert stored["impressions"] == 50000
    assert stored["engagements"] == 2500
    assert stored["engagement_rate"] == 0.05
    assert stored["saves_bookmarks"] == 300
    assert stored["shares_reposts"] == 400
    assert stored["comments"] == 200
    assert stored["clicks"] == 1000
    assert stored["follows_gained"] == 50
    assert stored["platform_specific"]["views"] == 50000
    assert stored["poll_index"] == 2


# ---------------------------------------------------------------------------
# 3. test_milestone_fires_once
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_milestone_fires_once():
    """Milestones are idempotent — a threshold already recorded is not duplicated."""
    # First call: milestone doesn't exist → created
    milestone_missing = _make_doc("event_1_1000", {}, exists=False)
    milestone_ref_new = _doc_ref(milestone_missing)

    notification_add = AsyncMock()

    db = MagicMock()

    def route_collection(name):
        coll = MagicMock()
        if name == "milestones":
            coll.document.return_value = milestone_ref_new
            return coll
        elif name == "notifications":
            coll.add = notification_add
            return coll
        return coll

    db.collection.side_effect = route_collection

    metrics = NormalizedMetrics(impressions=1200)  # Crosses 100, 500, 1000
    await _check_milestones(db, "event_1", "user_1", "twitter", metrics)

    # Should have set milestones for 100, 500, 1000
    assert milestone_ref_new.set.call_count == 3
    assert notification_add.call_count == 3

    # Second call: milestones already exist → skipped
    milestone_exists = _make_doc("event_1_1000", {"threshold": 1000}, exists=True)
    milestone_ref_exists = _doc_ref(milestone_exists)
    notification_add_2 = AsyncMock()

    db2 = MagicMock()

    def route_collection_2(name):
        coll = MagicMock()
        if name == "milestones":
            coll.document.return_value = milestone_ref_exists
            return coll
        elif name == "notifications":
            coll.add = notification_add_2
            return coll
        return coll

    db2.collection.side_effect = route_collection_2

    await _check_milestones(db2, "event_1", "user_1", "twitter", metrics)

    # All milestones already exist → nothing new created
    milestone_ref_exists.set.assert_not_called()
    notification_add_2.assert_not_called()


# ---------------------------------------------------------------------------
# 4. test_multiplier_score_calculation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_multiplier_score_calculation():
    """recalculate-scores computes multiplier = total_reach / single_platform_avg."""
    from app.api.v1.internal import recalculate_scores

    # Two published events for the same content, different platforms
    event_1 = _make_doc("ev_1", {
        "status": "published",
        "output_id": "out_1",
        "platform": "twitter",
        "user_id": "user_1",
    })
    event_2 = _make_doc("ev_2", {
        "status": "published",
        "output_id": "out_2",
        "platform": "linkedin",
        "user_id": "user_1",
    })

    published_stream = _collection_with_docs(event_1, event_2)

    # Both outputs belong to same content
    output_1 = _make_doc("out_1", {"content_upload_id": "content_1", "user_id": "user_1"})
    output_ref_1 = _doc_ref(output_1)
    output_2 = _make_doc("out_2", {"content_upload_id": "content_1", "user_id": "user_1"})
    output_ref_2 = _doc_ref(output_2)

    # Snapshots: twitter=8000, linkedin=4000
    snap_tw = _make_doc("snap_1", {"impressions": 8000, "engagements": 400, "engagement_rate": 0.05, "measured_at": NOW})
    snap_li = _make_doc("snap_2", {"impressions": 4000, "engagements": 200, "engagement_rate": 0.05, "measured_at": NOW})

    snap_stream_tw = _collection_with_docs(snap_tw)
    snap_stream_li = _collection_with_docs(snap_li)

    score_ref = MagicMock()
    score_ref.set = AsyncMock()

    db = MagicMock()

    snap_call_count = 0

    def route_collection(name):
        nonlocal snap_call_count
        coll = MagicMock()
        if name == "scheduled_posts":
            coll.where.return_value = published_stream
            return coll
        elif name == "generated_outputs":
            def pick_output(doc_id):
                if doc_id == "out_1":
                    return output_ref_1
                return output_ref_2
            coll.document.side_effect = pick_output
            return coll
        elif name == "post_analytics":
            snap_call_count += 1
            if snap_call_count == 1:
                coll.where.return_value = snap_stream_tw
            else:
                coll.where.return_value = snap_stream_li
            return coll
        elif name == "multiplier_scores":
            coll.document.return_value = score_ref
            return coll
        return coll

    db.collection.side_effect = route_collection

    with patch("app.api.v1.internal.get_db", return_value=db):
        result = await recalculate_scores()

    assert result["recalculated"] == 1

    # Verify the score document
    score_ref.set.assert_called_once()
    score_data = score_ref.set.call_args[0][0]

    # total_reach = 8000 + 4000 = 12000
    assert score_data["total_reach"] == 12000
    # single_platform_avg = 12000 / 2 = 6000
    assert score_data["single_platform_avg"] == 6000
    # multiplier = 12000 / 6000 = 2.0
    assert score_data["multiplier_value"] == 2.0
    assert score_data["platforms_published"] == 2
    assert score_data["best_platform_id"] == "twitter"
    assert score_data["best_platform_reach"] == 8000


# ---------------------------------------------------------------------------
# 5. test_overview_aggregation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_overview_aggregation():
    """GET /analytics/overview aggregates published posts and multiplier scores."""
    from app.api.v1.analytics import get_overview

    post_1 = _make_doc("ev_1", {
        "user_id": "user_1",
        "status": "published",
        "platform": "twitter",
        "published_at": NOW - timedelta(days=5),
        "latest_impressions": 8000,
        "latest_engagements": 400,
    })
    post_2 = _make_doc("ev_2", {
        "user_id": "user_1",
        "status": "published",
        "platform": "linkedin",
        "published_at": NOW - timedelta(days=10),
        "latest_impressions": 4000,
        "latest_engagements": 200,
    })
    posts_stream = _collection_with_docs(post_1, post_2)

    score_doc = _make_doc("score_1", {"multiplier_value": 2.0, "user_id": "user_1"})
    scores_stream = _collection_with_docs(score_doc)

    db = MagicMock()

    def route_collection(name):
        coll = MagicMock()
        if name == "scheduled_posts":
            coll.where.return_value = posts_stream
            return coll
        elif name == "multiplier_scores":
            coll.where.return_value = scores_stream
            return coll
        return coll

    db.collection.side_effect = route_collection

    with patch("app.api.v1.analytics.get_db", return_value=db):
        result = await get_overview(period="30d", current_user=_fake_user())

    assert result["period"] == "30d"
    assert result["total_posts_published"] == 2
    assert result["total_impressions"] == 12000
    assert result["total_engagements"] == 600
    assert result["avg_engagement_rate"] == round(600 / 12000, 4)
    assert result["platforms_active"] == 2
    assert result["platform_breakdown"]["twitter"] == 1
    assert result["platform_breakdown"]["linkedin"] == 1
    assert result["avg_multiplier"] == 2.0
    assert result["best_multiplier"] == 2.0
    assert len(result["top_performing"]) == 2


# ---------------------------------------------------------------------------
# 6. test_heatmap_7x24
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_heatmap_7x24():
    """GET /analytics/heatmap/{platform} buckets posts into day_of_week x hour cells."""
    from app.api.v1.analytics import get_heatmap

    # Create posts published at known days/hours
    # Monday 9 AM UTC (weekday=0)
    monday_9am = datetime(2026, 2, 23, 9, 0, 0, tzinfo=timezone.utc)  # Monday
    # Wednesday 15 PM UTC (weekday=2)
    wednesday_3pm = datetime(2026, 2, 25, 15, 0, 0, tzinfo=timezone.utc)  # Wednesday
    # Monday 9 AM again (same cell)
    monday_9am_2 = datetime(2026, 2, 16, 9, 0, 0, tzinfo=timezone.utc)  # Also Monday

    post_1 = _make_doc("ev_1", {
        "user_id": "user_1",
        "status": "published",
        "platform": "twitter",
        "published_at": monday_9am,
        "latest_impressions": 5000,
        "latest_engagements": 250,
    })
    post_2 = _make_doc("ev_2", {
        "user_id": "user_1",
        "status": "published",
        "platform": "twitter",
        "published_at": wednesday_3pm,
        "latest_impressions": 3000,
        "latest_engagements": 150,
    })
    post_3 = _make_doc("ev_3", {
        "user_id": "user_1",
        "status": "published",
        "platform": "twitter",
        "published_at": monday_9am_2,
        "latest_impressions": 2000,
        "latest_engagements": 100,
    })

    posts_stream = _collection_with_docs(post_1, post_2, post_3)

    db = MagicMock()

    def route_collection(name):
        coll = MagicMock()
        if name == "scheduled_posts":
            coll.where.return_value = posts_stream
            return coll
        return coll

    db.collection.side_effect = route_collection

    with patch("app.api.v1.analytics.get_db", return_value=db):
        result = await get_heatmap(platform="twitter", period="30d", current_user=_fake_user())

    assert result["platform"] == "twitter"
    heatmap = result["heatmap"]

    # Should have exactly 2 cells (Monday 9AM and Wednesday 3PM)
    assert len(heatmap) == 2

    # Find Monday 9AM cell (day_of_week=0, hour=9)
    mon_9 = next(c for c in heatmap if c["day_of_week"] == 0 and c["hour"] == 9)
    assert mon_9["post_count"] == 2  # Two posts in this cell
    assert mon_9["impressions"] == 7000  # 5000 + 2000
    assert mon_9["engagements"] == 350  # 250 + 100

    # Find Wednesday 3PM cell (day_of_week=2, hour=15)
    wed_15 = next(c for c in heatmap if c["day_of_week"] == 2 and c["hour"] == 15)
    assert wed_15["post_count"] == 1
    assert wed_15["impressions"] == 3000
    assert wed_15["engagement_rate"] == round(150 / 3000, 4)
