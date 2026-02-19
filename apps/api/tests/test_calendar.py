"""Tests for Sprint 7-8: Smart Calendar, Scheduling, and Publishing."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar import ScheduledEvent
from app.models.content import ContentUpload, GeneratedOutput
from app.services.publisher import (
    BasePlatformPublisher,
    PublisherRegistry,
    TwitterPublisher,
    LinkedInPublisher,
    init_publishers,
)
from app.services.scheduler import (
    CADENCE_DAYS,
    DISTRIBUTION_ARC,
    SchedulerService,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SIGNUP_URL = "/api/v1/auth/signup"
CALENDAR_BASE = "/api/v1/calendar"

VALID_USER = {
    "email": "calendar_test@example.com",
    "password": "securepassword123",
    "full_name": "Calendar Test User",
}


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    """Sign up a test user and return auth headers."""
    response = await client.post(SIGNUP_URL, json=VALID_USER)
    assert response.status_code == 201, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def content_with_outputs(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db_session: AsyncSession,
) -> ContentUpload:
    """Create a content upload with several approved outputs for testing."""
    # Upload content
    response = await client.post(
        "/api/v1/content/upload",
        json={
            "title": "Test Calendar Content",
            "content_type": "blog",
            "raw_content": "This is a test blog post with enough content for analysis. " * 20,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    content_id = response.json()["id"]

    # Load the content upload from DB
    result = await db_session.execute(
        select(ContentUpload).where(ContentUpload.id == uuid.UUID(content_id))
    )
    content_upload = result.scalar_one()

    # Manually create some outputs with "approved" status for testing
    platform_ids = [
        ("linkedin_post", "LinkedIn Post"),
        ("twitter_thread", "Twitter/X Thread"),
        ("instagram_carousel", "Instagram Carousel"),
        ("email_newsletter", "Email Newsletter"),
        ("bluesky_post", "Bluesky Post"),
        ("reddit_post", "Reddit Post"),
    ]

    for platform_id, format_name in platform_ids:
        output = GeneratedOutput(
            content_upload_id=content_upload.id,
            platform_id=platform_id,
            format_name=format_name,
            content=f"Test content for {format_name}. This is a sample output.",
            status="approved",
        )
        db_session.add(output)

    await db_session.flush()
    await db_session.refresh(content_upload)
    return content_upload


# ---------------------------------------------------------------------------
# Distribution Arc Tests (unit tests, no DB needed)
# ---------------------------------------------------------------------------


class TestDistributionArc:
    """Tests for the distribution arc logic."""

    def setup_method(self):
        self.scheduler = SchedulerService()

    def _make_output(self, platform_id: str) -> MagicMock:
        """Create a mock GeneratedOutput with a given platform_id."""
        output = MagicMock(spec=GeneratedOutput)
        output.id = uuid.uuid4()
        output.platform_id = platform_id
        return output

    def test_create_distribution_arc_sequence_order(self):
        """Verify day 1 = linkedin+twitter, day 2 = carousel, day 3 = newsletter, etc."""
        outputs = [
            self._make_output("linkedin_post"),
            self._make_output("twitter_thread"),
            self._make_output("instagram_carousel"),
            self._make_output("email_newsletter"),
            self._make_output("bluesky_post"),
            self._make_output("reddit_post"),
        ]

        # Use a future date to avoid the "past date" adjustment
        start = datetime(2030, 6, 1, tzinfo=timezone.utc)
        arc = self.scheduler.create_distribution_arc(outputs, start)

        assert len(arc) == 6

        # Build a lookup from platform_id to arc item
        by_platform = {item["platform_id"]: item for item in arc}

        # Day 1: LinkedIn and Twitter
        linkedin_dt = by_platform["linkedin_post"]["suggested_datetime"]
        twitter_dt = by_platform["twitter_thread"]["suggested_datetime"]
        assert linkedin_dt.day == 1  # June 1
        assert twitter_dt.day == 1

        # Day 2: Instagram carousel
        instagram_dt = by_platform["instagram_carousel"]["suggested_datetime"]
        assert instagram_dt.day == 2  # June 2

        # Day 3: Email newsletter
        email_dt = by_platform["email_newsletter"]["suggested_datetime"]
        assert email_dt.day == 3  # June 3

        # Day 4: Bluesky
        bluesky_dt = by_platform["bluesky_post"]["suggested_datetime"]
        assert bluesky_dt.day == 4  # June 4

        # Day 7: Reddit
        reddit_dt = by_platform["reddit_post"]["suggested_datetime"]
        assert reddit_dt.day == 7  # June 7

    def test_create_distribution_arc_respects_start_date(self):
        """Arc should offset from the provided start_date."""
        outputs = [self._make_output("linkedin_post")]
        start = datetime(2030, 3, 15, 9, 0, 0, tzinfo=timezone.utc)

        arc = self.scheduler.create_distribution_arc(outputs, start)
        assert len(arc) == 1

        # LinkedIn is Day 1, so it should be March 15
        suggested = arc[0]["suggested_datetime"]
        assert suggested.year == 2030
        assert suggested.month == 3
        assert suggested.day == 15

    def test_create_distribution_arc_skips_unapplicable_platforms(self):
        """Arc should handle unknown platform_ids gracefully with a default day."""
        outputs = [
            self._make_output("linkedin_post"),
            self._make_output("unknown_platform_xyz"),
        ]
        start = datetime(2030, 6, 1, tzinfo=timezone.utc)

        arc = self.scheduler.create_distribution_arc(outputs, start)
        assert len(arc) == 2

        # Unknown platform should get a default schedule (day 7)
        by_platform = {item["platform_id"]: item for item in arc}
        unknown_dt = by_platform["unknown_platform_xyz"]["suggested_datetime"]
        assert unknown_dt.day == 7  # Default day for unknown platforms

    def test_create_distribution_arc_empty_outputs(self):
        """Empty output list should return empty arc."""
        arc = self.scheduler.create_distribution_arc([], datetime.now(timezone.utc))
        assert arc == []

    def test_create_distribution_arc_sorted_chronologically(self):
        """Arc items should be sorted by suggested_datetime."""
        outputs = [
            self._make_output("reddit_post"),      # Day 7
            self._make_output("linkedin_post"),     # Day 1
            self._make_output("email_newsletter"),  # Day 3
        ]
        start = datetime(2030, 6, 1, tzinfo=timezone.utc)

        arc = self.scheduler.create_distribution_arc(outputs, start)

        datetimes = [item["suggested_datetime"] for item in arc]
        assert datetimes == sorted(datetimes)


# ---------------------------------------------------------------------------
# Content Gap Detection Tests
# ---------------------------------------------------------------------------


class TestContentGapDetection:
    """Tests for content gap detection logic."""

    @pytest.mark.asyncio
    async def test_detect_content_gaps_no_events(self, db_session: AsyncSession):
        """When there are no events, all known platforms should show as gaps."""
        scheduler = SchedulerService()
        workspace_id = uuid.uuid4()

        gaps = await scheduler.detect_content_gaps(db=db_session, workspace_id=workspace_id)

        # Should have entries for all known platforms
        assert len(gaps) > 0

        # All should have severity > "none" since there's no history
        platform_ids = {g["platform_id"] for g in gaps}
        assert "linkedin_post" in platform_ids
        assert "twitter_single" in platform_ids

        for gap in gaps:
            assert gap["gap_severity"] != "none"

    @pytest.mark.asyncio
    async def test_detect_content_gaps_recent_event(
        self, db_session: AsyncSession, content_with_outputs: ContentUpload
    ):
        """A recently scheduled event should show no gap."""
        scheduler = SchedulerService()
        workspace_id = content_with_outputs.workspace_id

        # Get an output to schedule
        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_with_outputs.id,
                GeneratedOutput.platform_id == "linkedin_post",
            )
        )
        output = result.scalar_one()

        # Schedule it for right now
        now = datetime.now(timezone.utc)
        event = ScheduledEvent(
            workspace_id=workspace_id,
            generated_output_id=output.id,
            platform_id="linkedin_post",
            scheduled_at=now,
            status="scheduled",
        )
        db_session.add(event)
        await db_session.flush()

        gaps = await scheduler.detect_content_gaps(db=db_session, workspace_id=workspace_id)

        # Find the linkedin gap
        linkedin_gap = next((g for g in gaps if g["platform_id"] == "linkedin_post"), None)
        assert linkedin_gap is not None
        assert linkedin_gap["gap_severity"] == "none"
        assert linkedin_gap["days_since_last"] == 0

    @pytest.mark.asyncio
    async def test_detect_content_gaps_old_event(
        self, db_session: AsyncSession, content_with_outputs: ContentUpload
    ):
        """An event scheduled long ago should show a gap."""
        scheduler = SchedulerService()
        workspace_id = content_with_outputs.workspace_id

        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_with_outputs.id,
                GeneratedOutput.platform_id == "linkedin_post",
            )
        )
        output = result.scalar_one()

        # Schedule it for 30 days ago
        old_date = datetime.now(timezone.utc) - timedelta(days=30)
        event = ScheduledEvent(
            workspace_id=workspace_id,
            generated_output_id=output.id,
            platform_id="linkedin_post",
            scheduled_at=old_date,
            status="published",
        )
        db_session.add(event)
        await db_session.flush()

        gaps = await scheduler.detect_content_gaps(db=db_session, workspace_id=workspace_id)

        linkedin_gap = next((g for g in gaps if g["platform_id"] == "linkedin_post"), None)
        assert linkedin_gap is not None
        # LinkedIn cadence is 2 days, 30 days ago is very severe
        assert linkedin_gap["gap_severity"] == "severe"
        assert linkedin_gap["days_since_last"] >= 29


# ---------------------------------------------------------------------------
# Scheduling API Integration Tests
# ---------------------------------------------------------------------------


class TestScheduleOutputAPI:
    """Integration tests for scheduling endpoints."""

    @pytest.mark.asyncio
    async def test_schedule_output_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        content_with_outputs: ContentUpload,
        db_session: AsyncSession,
    ):
        """Test scheduling a single output via the API."""
        # Get an approved output
        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_with_outputs.id,
                GeneratedOutput.platform_id == "linkedin_post",
            )
        )
        output = result.scalar_one()

        scheduled_at = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()

        response = await client.post(
            f"{CALENDAR_BASE}/schedule",
            json={
                "output_id": str(output.id),
                "scheduled_at": scheduled_at,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201, response.text

        data = response.json()
        assert data["status"] == "scheduled"
        assert data["platform_id"] == "linkedin_post"
        assert data["generated_output_id"] == str(output.id)
        assert data["priority"] == 1  # Manual schedule

    @pytest.mark.asyncio
    async def test_reschedule_event_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        content_with_outputs: ContentUpload,
        db_session: AsyncSession,
    ):
        """Test rescheduling an event via the API."""
        # Schedule first
        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_with_outputs.id,
                GeneratedOutput.platform_id == "twitter_thread",
            )
        )
        output = result.scalar_one()

        original_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        new_time = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()

        # Schedule
        response = await client.post(
            f"{CALENDAR_BASE}/schedule",
            json={
                "output_id": str(output.id),
                "scheduled_at": original_time,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        event_id = response.json()["id"]

        # Reschedule
        response = await client.patch(
            f"{CALENDAR_BASE}/events/{event_id}/reschedule",
            json={"scheduled_at": new_time},
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert data["status"] == "scheduled"

    @pytest.mark.asyncio
    async def test_cancel_event_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        content_with_outputs: ContentUpload,
        db_session: AsyncSession,
    ):
        """Test cancelling an event via the API."""
        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_with_outputs.id,
                GeneratedOutput.platform_id == "instagram_carousel",
            )
        )
        output = result.scalar_one()

        scheduled_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

        # Schedule
        response = await client.post(
            f"{CALENDAR_BASE}/schedule",
            json={
                "output_id": str(output.id),
                "scheduled_at": scheduled_at,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        event_id = response.json()["id"]

        # Cancel
        response = await client.delete(
            f"{CALENDAR_BASE}/events/{event_id}",
            headers=auth_headers,
        )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_get_calendar_events_date_range(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        content_with_outputs: ContentUpload,
        db_session: AsyncSession,
    ):
        """Test getting events within a date range."""
        # Schedule two outputs
        results = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_with_outputs.id,
            )
        )
        outputs = list(results.scalars().all())

        for i, output in enumerate(outputs[:2]):
            scheduled_at = (datetime.now(timezone.utc) + timedelta(hours=i + 1)).isoformat()
            response = await client.post(
                f"{CALENDAR_BASE}/schedule",
                json={
                    "output_id": str(output.id),
                    "scheduled_at": scheduled_at,
                },
                headers=auth_headers,
            )
            assert response.status_code == 201, response.text

        # Query events
        start = datetime.now(timezone.utc).isoformat()
        end = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()

        response = await client.get(
            f"{CALENDAR_BASE}/events",
            params={"start": start, "end": end},
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert data["total"] >= 2
        assert len(data["events"]) >= 2

        # Each event should have enriched data
        for event in data["events"]:
            assert "platform_id" in event
            assert "status" in event


# ---------------------------------------------------------------------------
# Mark Failed with Retry Backoff Tests
# ---------------------------------------------------------------------------


class TestMarkFailedRetryBackoff:
    """Tests for the retry logic in mark_failed."""

    @pytest.mark.asyncio
    async def test_mark_failed_with_retry_backoff(
        self, db_session: AsyncSession, content_with_outputs: ContentUpload
    ):
        """When retry_count < max_retries, event should be rescheduled with backoff."""
        scheduler = SchedulerService()
        workspace_id = content_with_outputs.workspace_id

        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_with_outputs.id,
                GeneratedOutput.platform_id == "email_newsletter",
            )
        )
        output = result.scalar_one()

        # Create a scheduled event
        event = ScheduledEvent(
            workspace_id=workspace_id,
            generated_output_id=output.id,
            platform_id="email_newsletter",
            scheduled_at=datetime.now(timezone.utc) - timedelta(minutes=5),
            status="publishing",
            max_retries=3,
        )
        db_session.add(event)
        await db_session.flush()
        await db_session.refresh(event)

        # First failure: retry_count goes to 1, backoff = 2^1 * 60 = 120s
        event = await scheduler.mark_failed(
            db=db_session, event_id=event.id, error="Connection timeout"
        )
        assert event.retry_count == 1
        assert event.status == "scheduled"  # Re-queued, not permanently failed
        assert event.publish_error == "Connection timeout"
        # The new scheduled_at should be roughly 2 minutes from now
        expected_min = datetime.now(timezone.utc) + timedelta(seconds=100)
        assert event.scheduled_at >= expected_min

        # Second failure: retry_count goes to 2, backoff = 2^2 * 60 = 240s
        event.status = "publishing"
        await db_session.flush()
        event = await scheduler.mark_failed(
            db=db_session, event_id=event.id, error="API rate limited"
        )
        assert event.retry_count == 2
        assert event.status == "scheduled"

        # Third failure: retry_count goes to 3, which equals max_retries — permanent failure
        event.status = "publishing"
        await db_session.flush()
        event = await scheduler.mark_failed(
            db=db_session, event_id=event.id, error="Service unavailable"
        )
        assert event.retry_count == 3
        assert event.status == "failed"  # Permanently failed
        assert event.publish_error == "Service unavailable"


# ---------------------------------------------------------------------------
# Publisher Registry Tests
# ---------------------------------------------------------------------------


class TestPublisherRegistry:
    """Tests for the publisher registry."""

    def test_publisher_registry_register_and_get(self):
        """Test registering and retrieving a publisher."""
        # Clear existing registrations for a clean test
        original = PublisherRegistry._publishers.copy()
        PublisherRegistry._publishers.clear()

        try:
            twitter = TwitterPublisher()
            PublisherRegistry.register("test_twitter", twitter)

            assert PublisherRegistry.is_supported("test_twitter") is True
            assert PublisherRegistry.is_supported("nonexistent") is False

            retrieved = PublisherRegistry.get("test_twitter")
            assert retrieved is twitter

            assert PublisherRegistry.get("nonexistent") is None
        finally:
            PublisherRegistry._publishers = original

    def test_init_publishers_registers_all(self):
        """Test that init_publishers registers all expected platforms."""
        original = PublisherRegistry._publishers.copy()
        PublisherRegistry._publishers.clear()

        try:
            init_publishers()

            # Check key platforms are registered
            expected_platforms = [
                "twitter_single",
                "twitter_thread",
                "linkedin_post",
                "linkedin_article",
                "bluesky_post",
                "instagram_carousel",
                "instagram_caption",
                "pinterest_pin",
                "medium_post",
                "youtube_longform",
                "short_form_video",
                "reddit_post",
                "quora_answer",
            ]

            for platform_id in expected_platforms:
                assert PublisherRegistry.is_supported(platform_id), (
                    f"Expected platform '{platform_id}' to be registered"
                )

            supported = PublisherRegistry.get_supported_platforms()
            assert len(supported) == len(expected_platforms)
        finally:
            PublisherRegistry._publishers = original

    @pytest.mark.asyncio
    async def test_twitter_publisher_stub_returns_not_implemented(self):
        """Stub publishers should return success=False with a helpful error."""
        publisher = TwitterPublisher()
        connection = MagicMock()

        result = await publisher.publish("test content", {}, connection)

        assert result["success"] is False
        assert result["post_id"] is None
        assert "not yet implemented" in result["error"]

    @pytest.mark.asyncio
    async def test_linkedin_publisher_stub_returns_not_implemented(self):
        """Stub publishers should return success=False with a helpful error."""
        publisher = LinkedInPublisher()
        connection = MagicMock()

        result = await publisher.publish("test content", {}, connection)

        assert result["success"] is False
        assert "not yet implemented" in result["error"]


# ---------------------------------------------------------------------------
# Calendar Stats and Upcoming Tests
# ---------------------------------------------------------------------------


class TestCalendarStats:
    """Tests for calendar stats and upcoming endpoints."""

    @pytest.mark.asyncio
    async def test_get_calendar_stats(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test the /calendar/stats endpoint returns valid structure."""
        response = await client.get(
            f"{CALENDAR_BASE}/stats",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert "total_scheduled" in data
        assert "total_published" in data
        assert "total_failed" in data
        assert "upcoming_today" in data
        assert "upcoming_this_week" in data
        assert "platforms_active" in data
        assert "content_gaps" in data
        assert isinstance(data["content_gaps"], list)

    @pytest.mark.asyncio
    async def test_get_upcoming_events(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test the /calendar/upcoming endpoint returns valid structure."""
        response = await client.get(
            f"{CALENDAR_BASE}/upcoming",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert "events" in data
        assert "total" in data
        assert isinstance(data["events"], list)


# ---------------------------------------------------------------------------
# Auto-Schedule Tests
# ---------------------------------------------------------------------------


class TestAutoSchedule:
    """Tests for the auto-schedule endpoint."""

    @pytest.mark.asyncio
    async def test_auto_schedule_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        content_with_outputs: ContentUpload,
    ):
        """Test auto-scheduling all approved outputs for a content piece."""
        start_date = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()

        response = await client.post(
            f"{CALENDAR_BASE}/auto-schedule",
            json={
                "content_id": str(content_with_outputs.id),
                "start_date": start_date,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201, response.text

        data = response.json()
        assert data["total"] > 0
        assert len(data["events"]) > 0

        # Events should be from different platforms
        platforms = {e["platform_id"] for e in data["events"]}
        assert len(platforms) > 1

    @pytest.mark.asyncio
    async def test_auto_schedule_no_approved_outputs(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Auto-schedule with no approved outputs should return 422."""
        # Upload content (outputs will be in draft status, not approved)
        response = await client.post(
            "/api/v1/content/upload",
            json={
                "title": "No Approved Outputs",
                "content_type": "blog",
                "raw_content": "This content has no approved outputs for testing. " * 10,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        content_id = response.json()["id"]

        start_date = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()

        response = await client.post(
            f"{CALENDAR_BASE}/auto-schedule",
            json={
                "content_id": content_id,
                "start_date": start_date,
            },
            headers=auth_headers,
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# Platform Connections Tests
# ---------------------------------------------------------------------------


class TestPlatformConnections:
    """Tests for the platform connections endpoints."""

    @pytest.mark.asyncio
    async def test_list_connections_empty(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing connections when none exist."""
        response = await client.get(
            "/api/v1/connections",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_connect_platform(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test connecting a platform via OAuth data."""
        response = await client.post(
            "/api/v1/connections/linkedin_post/connect",
            json={
                "access_token": "test_access_token_123",
                "refresh_token": "test_refresh_token_456",
                "platform_username": "testuser",
                "scopes": ["w_member_social"],
            },
            headers=auth_headers,
        )
        assert response.status_code == 201, response.text

        data = response.json()
        assert data["platform_id"] == "linkedin_post"
        assert data["platform_username"] == "testuser"
        assert data["is_active"] is True

    @pytest.mark.asyncio
    async def test_disconnect_platform(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test disconnecting a platform."""
        # Connect first
        response = await client.post(
            "/api/v1/connections/twitter_single/connect",
            json={
                "access_token": "twitter_token",
                "platform_username": "testhandle",
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        connection_id = response.json()["id"]

        # Disconnect
        response = await client.delete(
            f"/api/v1/connections/{connection_id}",
            headers=auth_headers,
        )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_get_connection_status(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test checking connection status for a platform."""
        # Check status before connecting
        response = await client.get(
            "/api/v1/connections/bluesky_post/status",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        assert data["connected"] is False
        assert data["platform_id"] == "bluesky_post"

        # Connect
        await client.post(
            "/api/v1/connections/bluesky_post/connect",
            json={
                "access_token": "bsky_token",
                "platform_username": "test.bsky.social",
            },
            headers=auth_headers,
        )

        # Check status after connecting
        response = await client.get(
            "/api/v1/connections/bluesky_post/status",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        assert data["connected"] is True
        assert data["platform_username"] == "test.bsky.social"
