"""Tests for Sprint 9-10: Analytics Dashboard & Multiplier Score."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analytics import AnalyticsSnapshot, MultiplierScore
from app.models.calendar import ScheduledEvent
from app.models.content import ContentUpload, GeneratedOutput
from app.services.analytics import AnalyticsService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SIGNUP_URL = "/api/v1/auth/signup"
ANALYTICS_BASE = "/api/v1/analytics"

VALID_USER = {
    "email": "analytics_test@example.com",
    "password": "securepassword123",
    "full_name": "Analytics Test User",
}


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    """Sign up a test user and return auth headers."""
    response = await client.post(SIGNUP_URL, json=VALID_USER)
    assert response.status_code == 201, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def workspace_id(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db_session: AsyncSession,
) -> uuid.UUID:
    """Get the workspace ID for the test user."""
    # Upload content to trigger workspace creation via the auth flow
    response = await client.post(
        "/api/v1/content/upload",
        json={
            "title": "Workspace Probe",
            "content_type": "blog",
            "raw_content": "This is test content to establish the workspace. " * 10,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    content_id = response.json()["id"]

    result = await db_session.execute(
        select(ContentUpload).where(ContentUpload.id == uuid.UUID(content_id))
    )
    content = result.scalar_one()
    return content.workspace_id


@pytest_asyncio.fixture
async def content_with_published_outputs(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db_session: AsyncSession,
) -> ContentUpload:
    """Create a content upload with several published outputs and snapshots."""
    # Upload content
    response = await client.post(
        "/api/v1/content/upload",
        json={
            "title": "Test Analytics Content",
            "content_type": "blog",
            "raw_content": "This is a test blog post for analytics testing. " * 20,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    content_id = response.json()["id"]

    result = await db_session.execute(
        select(ContentUpload).where(ContentUpload.id == uuid.UUID(content_id))
    )
    content_upload = result.scalar_one()

    # Create published outputs with known metrics
    platform_data = [
        ("linkedin_post", "LinkedIn Post", 5000, 250, 0.05),
        ("twitter_thread", "Twitter/X Thread", 10000, 400, 0.04),
        ("instagram_carousel", "Instagram Carousel", 3000, 300, 0.10),
    ]

    now = datetime.now(timezone.utc)
    for platform_id, format_name, impressions, engagements, eng_rate in platform_data:
        output = GeneratedOutput(
            content_upload_id=content_upload.id,
            platform_id=platform_id,
            format_name=format_name,
            content=f"Test content for {format_name}.",
            metadata={"hook_type": "contrarian"},
            status="published",
            published_at=now - timedelta(hours=2),
        )
        db_session.add(output)
        await db_session.flush()
        await db_session.refresh(output)

        # Create analytics snapshot
        snapshot = AnalyticsSnapshot(
            generated_output_id=output.id,
            workspace_id=content_upload.workspace_id,
            platform_id=platform_id,
            snapshot_time=now - timedelta(hours=1),
            impressions=impressions,
            engagements=engagements,
            engagement_rate=eng_rate,
            saves_bookmarks=10,
            shares_reposts=20,
            comments=15,
            clicks=50,
            follows_gained=5,
        )
        db_session.add(snapshot)

        # Also create a scheduled event marked as published
        event = ScheduledEvent(
            workspace_id=content_upload.workspace_id,
            generated_output_id=output.id,
            platform_id=platform_id,
            scheduled_at=now - timedelta(hours=3),
            published_at=now - timedelta(hours=2),
            status="published",
        )
        db_session.add(event)

    await db_session.flush()
    await db_session.refresh(content_upload)
    return content_upload


# ---------------------------------------------------------------------------
# Multiplier Score Tests
# ---------------------------------------------------------------------------


class TestMultiplierScore:
    """Tests for the Multiplier Score calculation logic."""

    @pytest.mark.asyncio
    async def test_calculate_multiplier_score_basic(
        self,
        db_session: AsyncSession,
        content_with_published_outputs: ContentUpload,
    ):
        """Two platforms with known reach should produce correct multiplier.

        Platform reach: LinkedIn=5000, Twitter=10000, Instagram=3000
        Total reach = 18000
        Best single platform = Twitter = 10000
        Multiplier = 18000 / 10000 = 1.8
        """
        service = AnalyticsService()
        content = content_with_published_outputs

        score = await service.calculate_multiplier_score(
            db_session, content.id, content.workspace_id
        )

        assert score is not None
        assert score.content_upload_id == content.id
        assert score.total_reach == 18000
        assert score.original_reach == 10000  # best platform (Twitter)
        assert score.multiplier_value == 1.8
        assert score.platforms_published == 3
        assert score.best_platform_id == "twitter_thread"
        assert score.best_platform_reach == 10000
        assert len(score.platform_breakdown) == 3
        assert score.total_engagements == 950  # 250 + 400 + 300

    @pytest.mark.asyncio
    async def test_calculate_multiplier_score_no_published(
        self,
        db_session: AsyncSession,
        workspace_id: uuid.UUID,
    ):
        """Content with no published outputs should return multiplier of 1.0."""
        service = AnalyticsService()

        # Create a content upload with only draft outputs
        content = ContentUpload(
            workspace_id=workspace_id,
            user_id=uuid.uuid4(),
            title="Draft Only Content",
            content_type="blog",
            raw_content="This content has no published outputs.",
            status="analyzed",
        )
        db_session.add(content)
        await db_session.flush()
        await db_session.refresh(content)

        output = GeneratedOutput(
            content_upload_id=content.id,
            platform_id="linkedin_post",
            format_name="LinkedIn Post",
            content="Draft content",
            status="draft",
        )
        db_session.add(output)
        await db_session.flush()

        score = await service.calculate_multiplier_score(
            db_session, content.id, workspace_id
        )

        assert score is not None
        assert score.multiplier_value == 1.0
        assert score.total_reach == 0
        assert score.platforms_published == 0

    @pytest.mark.asyncio
    async def test_get_multiplier_score_cached(
        self,
        db_session: AsyncSession,
        content_with_published_outputs: ContentUpload,
    ):
        """Calculating twice should update the existing record, not create a new one."""
        service = AnalyticsService()
        content = content_with_published_outputs

        score1 = await service.calculate_multiplier_score(
            db_session, content.id, content.workspace_id
        )
        score2 = await service.calculate_multiplier_score(
            db_session, content.id, content.workspace_id
        )

        assert score1.id == score2.id  # Same record updated
        assert score2.multiplier_value == 1.8

    @pytest.mark.asyncio
    async def test_get_workspace_multiplier_scores(
        self,
        db_session: AsyncSession,
        content_with_published_outputs: ContentUpload,
    ):
        """Workspace scores should be returned ordered by multiplier_value desc."""
        service = AnalyticsService()
        content = content_with_published_outputs

        await service.calculate_multiplier_score(
            db_session, content.id, content.workspace_id
        )

        scores = await service.get_workspace_multiplier_scores(
            db_session, content.workspace_id
        )

        assert len(scores) >= 1
        # If multiple, should be sorted descending
        for i in range(len(scores) - 1):
            assert scores[i].multiplier_value >= scores[i + 1].multiplier_value


# ---------------------------------------------------------------------------
# Platform Performance Tests
# ---------------------------------------------------------------------------


class TestPlatformPerformance:
    """Tests for platform performance aggregation and trend calculation."""

    @pytest.mark.asyncio
    async def test_platform_performance_trend_calculation(
        self,
        db_session: AsyncSession,
        content_with_published_outputs: ContentUpload,
    ):
        """Platform performance should include trend information."""
        service = AnalyticsService()
        workspace_id = content_with_published_outputs.workspace_id

        perf = await service.get_platform_performance(db_session, workspace_id, days=30)

        assert len(perf) > 0
        for p in perf:
            assert "platform_id" in p
            assert "platform_name" in p
            assert "total_impressions" in p
            assert "total_engagements" in p
            assert "avg_engagement_rate" in p
            assert "total_saves" in p
            assert "total_shares" in p
            assert "total_clicks" in p
            assert "total_follows" in p
            assert "post_count" in p
            assert p["trend"] in ("improving", "stable", "declining")

    @pytest.mark.asyncio
    async def test_platform_performance_empty_workspace(
        self,
        db_session: AsyncSession,
    ):
        """Empty workspace should return empty list."""
        service = AnalyticsService()
        perf = await service.get_platform_performance(db_session, uuid.uuid4(), days=30)
        assert perf == []


# ---------------------------------------------------------------------------
# Content Type Performance Tests
# ---------------------------------------------------------------------------


class TestContentTypePerformance:
    """Tests for content type aggregation."""

    @pytest.mark.asyncio
    async def test_content_type_aggregation(
        self,
        db_session: AsyncSession,
        content_with_published_outputs: ContentUpload,
    ):
        """Content type performance should aggregate by content_type."""
        service = AnalyticsService()
        workspace_id = content_with_published_outputs.workspace_id

        perf = await service.get_content_type_performance(
            db_session, workspace_id, days=30
        )

        assert len(perf) > 0
        for ct in perf:
            assert "content_type" in ct
            assert "avg_engagement_rate" in ct
            assert "total_reach" in ct
            assert "post_count" in ct
            assert "avg_multiplier_score" in ct

        # Our fixture uses "blog" content type
        blog_entry = next((c for c in perf if c["content_type"] == "blog"), None)
        assert blog_entry is not None
        assert blog_entry["post_count"] >= 1


# ---------------------------------------------------------------------------
# Time Heatmap Tests
# ---------------------------------------------------------------------------


class TestTimeHeatmap:
    """Tests for the day/hour engagement heatmap."""

    @pytest.mark.asyncio
    async def test_time_heatmap_structure(
        self,
        db_session: AsyncSession,
        content_with_published_outputs: ContentUpload,
    ):
        """Heatmap should have entries for all 7 days x 24 hours = 168 entries."""
        service = AnalyticsService()
        workspace_id = content_with_published_outputs.workspace_id

        heatmap = await service.get_time_of_day_performance(
            db_session, workspace_id, days=30
        )

        # Should have exactly 168 entries (7 days x 24 hours)
        assert len(heatmap) == 168

        # Verify structure
        for entry in heatmap:
            assert "day_of_week" in entry
            assert "hour" in entry
            assert "avg_engagement_rate" in entry
            assert "post_count" in entry
            assert 0 <= entry["day_of_week"] <= 6
            assert 0 <= entry["hour"] <= 23

        # All day/hour combinations should be present
        combos = {(e["day_of_week"], e["hour"]) for e in heatmap}
        expected = {(d, h) for d in range(7) for h in range(24)}
        assert combos == expected


# ---------------------------------------------------------------------------
# Content Strategy Suggestions Tests
# ---------------------------------------------------------------------------


class TestContentStrategySuggestions:
    """Tests for rule-based strategy suggestions."""

    @pytest.mark.asyncio
    async def test_content_strategy_suggestions_high_performer(
        self,
        db_session: AsyncSession,
        content_with_published_outputs: ContentUpload,
    ):
        """Workspace with data should produce suggestions."""
        service = AnalyticsService()
        workspace_id = content_with_published_outputs.workspace_id

        suggestions = await service.get_content_strategy_suggestions(
            db_session, workspace_id
        )

        assert isinstance(suggestions, list)
        for s in suggestions:
            assert "type" in s
            assert s["type"] in ("topic", "format", "timing", "platform")
            assert "suggestion" in s
            assert isinstance(s["suggestion"], str)
            assert "confidence" in s
            assert 0.0 <= s["confidence"] <= 1.0
            assert "data_points" in s

    @pytest.mark.asyncio
    async def test_content_strategy_suggestions_empty_data(
        self,
        db_session: AsyncSession,
    ):
        """Workspace with no data should still return a helpful suggestion."""
        service = AnalyticsService()
        suggestions = await service.get_content_strategy_suggestions(
            db_session, uuid.uuid4()
        )

        assert len(suggestions) >= 1
        # Should suggest starting to publish
        assert any("publish" in s["suggestion"].lower() for s in suggestions)


# ---------------------------------------------------------------------------
# Audience Intelligence Tests
# ---------------------------------------------------------------------------


class TestAudienceIntelligence:
    """Tests for audience insights."""

    @pytest.mark.asyncio
    async def test_audience_intelligence_ranking(
        self,
        db_session: AsyncSession,
        content_with_published_outputs: ContentUpload,
    ):
        """Audience intelligence should rank platforms and provide recommendations."""
        service = AnalyticsService()
        workspace_id = content_with_published_outputs.workspace_id

        intel = await service.get_audience_intelligence(db_session, workspace_id)

        assert "fastest_growing_platform" in intel
        assert "best_engagement_platform" in intel
        assert "platform_rankings" in intel
        assert "recommendations" in intel

        assert isinstance(intel["platform_rankings"], list)
        assert len(intel["platform_rankings"]) > 0

        # Rankings should be sorted by score descending
        for i in range(len(intel["platform_rankings"]) - 1):
            assert (
                intel["platform_rankings"][i]["score"]
                >= intel["platform_rankings"][i + 1]["score"]
            )

        assert isinstance(intel["recommendations"], list)
        assert len(intel["recommendations"]) > 0

    @pytest.mark.asyncio
    async def test_audience_intelligence_empty(
        self,
        db_session: AsyncSession,
    ):
        """Empty workspace should return sensible defaults."""
        service = AnalyticsService()
        intel = await service.get_audience_intelligence(db_session, uuid.uuid4())

        assert intel["fastest_growing_platform"] is None
        assert intel["best_engagement_platform"] is None
        assert intel["platform_rankings"] == []
        assert len(intel["recommendations"]) >= 1


# ---------------------------------------------------------------------------
# Snapshot Tests
# ---------------------------------------------------------------------------


class TestRecordSnapshot:
    """Tests for recording analytics snapshots."""

    @pytest.mark.asyncio
    async def test_record_snapshot(
        self,
        db_session: AsyncSession,
        content_with_published_outputs: ContentUpload,
    ):
        """Recording a snapshot should persist all metrics."""
        service = AnalyticsService()
        content = content_with_published_outputs

        # Get an output
        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content.id,
                GeneratedOutput.status == "published",
            )
        )
        output = result.scalars().first()
        assert output is not None

        metrics = {
            "impressions": 1500,
            "engagements": 75,
            "engagement_rate": 0.05,
            "saves_bookmarks": 10,
            "shares_reposts": 5,
            "comments": 12,
            "clicks": 30,
            "follows_gained": 3,
            "platform_specific": {"linkedin_profile_views": 200},
        }

        snapshot = await service.record_snapshot(
            db_session, output.id, content.workspace_id, metrics
        )

        assert snapshot is not None
        assert snapshot.generated_output_id == output.id
        assert snapshot.workspace_id == content.workspace_id
        assert snapshot.impressions == 1500
        assert snapshot.engagements == 75
        assert snapshot.engagement_rate == 0.05
        assert snapshot.saves_bookmarks == 10
        assert snapshot.shares_reposts == 5
        assert snapshot.comments == 12
        assert snapshot.clicks == 30
        assert snapshot.follows_gained == 3
        assert snapshot.platform_specific == {"linkedin_profile_views": 200}

    @pytest.mark.asyncio
    async def test_get_latest_snapshot(
        self,
        db_session: AsyncSession,
        content_with_published_outputs: ContentUpload,
    ):
        """Getting latest snapshot should return the most recent one."""
        service = AnalyticsService()
        content = content_with_published_outputs

        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content.id,
                GeneratedOutput.status == "published",
            )
        )
        output = result.scalars().first()
        assert output is not None

        # Record two snapshots
        await service.record_snapshot(
            db_session, output.id, content.workspace_id,
            {"impressions": 100, "engagements": 10, "engagement_rate": 0.1},
        )
        await service.record_snapshot(
            db_session, output.id, content.workspace_id,
            {"impressions": 200, "engagements": 20, "engagement_rate": 0.1},
        )

        latest = await service.get_latest_snapshot(db_session, output.id)
        assert latest is not None
        assert latest.impressions == 200


# ---------------------------------------------------------------------------
# Dashboard Overview Tests
# ---------------------------------------------------------------------------


class TestDashboardOverview:
    """Tests for the main analytics dashboard."""

    @pytest.mark.asyncio
    async def test_dashboard_overview_structure(
        self,
        db_session: AsyncSession,
        content_with_published_outputs: ContentUpload,
    ):
        """Dashboard overview should return all expected fields."""
        service = AnalyticsService()
        workspace_id = content_with_published_outputs.workspace_id

        dashboard = await service.get_dashboard_overview(db_session, workspace_id)

        assert "total_content_pieces" in dashboard
        assert "total_outputs_generated" in dashboard
        assert "total_published" in dashboard
        assert "total_reach" in dashboard
        assert "total_engagements" in dashboard
        assert "avg_multiplier_score" in dashboard
        assert "best_multiplier_score" in dashboard
        assert "platforms_active" in dashboard
        assert "top_performing_content" in dashboard
        assert "recent_performance" in dashboard

        assert dashboard["total_content_pieces"] >= 1
        assert dashboard["total_published"] >= 1
        assert dashboard["total_reach"] > 0
        assert dashboard["total_engagements"] > 0

        # Recent performance should have 30 daily entries
        assert len(dashboard["recent_performance"]) == 30
        for day in dashboard["recent_performance"]:
            assert "date" in day
            assert "impressions" in day
            assert "engagements" in day

    @pytest.mark.asyncio
    async def test_dashboard_overview_empty_workspace(
        self,
        db_session: AsyncSession,
    ):
        """Empty workspace should return zeros, not errors."""
        service = AnalyticsService()
        dashboard = await service.get_dashboard_overview(db_session, uuid.uuid4())

        assert dashboard["total_content_pieces"] == 0
        assert dashboard["total_outputs_generated"] == 0
        assert dashboard["total_published"] == 0
        assert dashboard["total_reach"] == 0
        assert dashboard["total_engagements"] == 0
        assert dashboard["avg_multiplier_score"] == 0.0
        assert dashboard["best_multiplier_score"] == 0.0
        assert dashboard["platforms_active"] == 0
        assert dashboard["top_performing_content"] == []
        assert len(dashboard["recent_performance"]) == 30


# ---------------------------------------------------------------------------
# API Integration Tests
# ---------------------------------------------------------------------------


class TestAnalyticsAPI:
    """Integration tests for analytics endpoints."""

    @pytest.mark.asyncio
    async def test_dashboard_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test the /analytics/dashboard endpoint returns valid structure."""
        response = await client.get(
            f"{ANALYTICS_BASE}/dashboard",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert "total_content_pieces" in data
        assert "total_reach" in data
        assert "recent_performance" in data

    @pytest.mark.asyncio
    async def test_multiplier_scores_list_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test the /analytics/multiplier-scores endpoint."""
        response = await client.get(
            f"{ANALYTICS_BASE}/multiplier-scores",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_platform_performance_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test the /analytics/platform-performance endpoint."""
        response = await client.get(
            f"{ANALYTICS_BASE}/platform-performance",
            params={"days": 30},
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_content_types_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test the /analytics/content-types endpoint."""
        response = await client.get(
            f"{ANALYTICS_BASE}/content-types",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_hook_performance_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test the /analytics/hook-performance endpoint."""
        response = await client.get(
            f"{ANALYTICS_BASE}/hook-performance",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_time_heatmap_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test the /analytics/time-heatmap endpoint."""
        response = await client.get(
            f"{ANALYTICS_BASE}/time-heatmap",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 168  # 7 days x 24 hours

    @pytest.mark.asyncio
    async def test_audience_intelligence_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test the /analytics/audience-intelligence endpoint."""
        response = await client.get(
            f"{ANALYTICS_BASE}/audience-intelligence",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert "platform_rankings" in data
        assert "recommendations" in data

    @pytest.mark.asyncio
    async def test_strategy_suggestions_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test the /analytics/strategy-suggestions endpoint."""
        response = await client.get(
            f"{ANALYTICS_BASE}/strategy-suggestions",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_record_snapshot_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        content_with_published_outputs: ContentUpload,
        db_session: AsyncSession,
    ):
        """Test recording a snapshot via the API."""
        # Get a published output
        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_with_published_outputs.id,
                GeneratedOutput.status == "published",
            )
        )
        output = result.scalars().first()
        assert output is not None

        response = await client.post(
            f"{ANALYTICS_BASE}/snapshots",
            json={
                "output_id": str(output.id),
                "impressions": 5000,
                "engagements": 250,
                "engagement_rate": 0.05,
                "saves_bookmarks": 30,
                "shares_reposts": 10,
                "comments": 20,
                "clicks": 100,
                "follows_gained": 5,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201, response.text

        data = response.json()
        assert data["impressions"] == 5000
        assert data["engagements"] == 250
        assert data["platform_id"] == output.platform_id

    @pytest.mark.asyncio
    async def test_snapshot_history_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        content_with_published_outputs: ContentUpload,
        db_session: AsyncSession,
    ):
        """Test getting snapshot history for an output."""
        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_with_published_outputs.id,
                GeneratedOutput.status == "published",
            )
        )
        output = result.scalars().first()
        assert output is not None

        response = await client.get(
            f"{ANALYTICS_BASE}/snapshots/{output.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_calculate_multiplier_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        content_with_published_outputs: ContentUpload,
    ):
        """Test recalculating multiplier score via the API."""
        content_id = content_with_published_outputs.id

        response = await client.post(
            f"{ANALYTICS_BASE}/multiplier-scores/{content_id}/calculate",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert data["content_upload_id"] == str(content_id)
        assert data["multiplier_value"] > 0
        assert data["platforms_published"] >= 1

    @pytest.mark.asyncio
    async def test_get_multiplier_score_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Getting a multiplier score for nonexistent content should return 404."""
        fake_id = uuid.uuid4()
        response = await client.get(
            f"{ANALYTICS_BASE}/multiplier-scores/{fake_id}",
            headers=auth_headers,
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_record_snapshot_nonexistent_output(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Recording a snapshot for a nonexistent output should return 404."""
        fake_id = uuid.uuid4()
        response = await client.post(
            f"{ANALYTICS_BASE}/snapshots",
            json={
                "output_id": str(fake_id),
                "impressions": 100,
            },
            headers=auth_headers,
        )
        assert response.status_code == 404
