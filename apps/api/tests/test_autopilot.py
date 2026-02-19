"""Tests for Sprint 11-12: Autopilot, A/B Testing, Audit, and Security."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.autopilot import AutopilotConfig, ABTest
from app.models.content import ContentUpload, GeneratedOutput
from app.models.analytics import AnalyticsSnapshot
from app.services.autopilot import AutopilotService
from app.services.ab_testing import ABTestingService
from app.utils.exceptions import ValidationError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SIGNUP_URL = "/api/v1/auth/signup"
AUTOPILOT_BASE = "/api/v1/autopilot"
AB_TESTS_BASE = "/api/v1/ab-tests"
SECURITY_BASE = "/api/v1/security"

VALID_USER = {
    "email": "autopilot_test@example.com",
    "password": "securepassword123",
    "full_name": "Autopilot Test User",
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
    from app.models.organization import OrganizationMember, Workspace

    # Get user's membership
    response = await client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    user_id = uuid.UUID(response.json()["id"])

    result = await db_session.execute(
        select(OrganizationMember).where(OrganizationMember.user_id == user_id).limit(1)
    )
    membership = result.scalar_one()

    result = await db_session.execute(
        select(Workspace)
        .where(Workspace.organization_id == membership.organization_id)
        .limit(1)
    )
    workspace = result.scalar_one()
    return workspace.id


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
            "title": "Test Autopilot Content",
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

    # Create some outputs with "approved" status for testing
    platform_ids = [
        ("linkedin_post", "LinkedIn Post"),
        ("twitter_thread", "Twitter/X Thread"),
        ("instagram_carousel", "Instagram Carousel"),
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
# Autopilot Service Tests
# ---------------------------------------------------------------------------


class TestAutopilotRecordReview:
    """Tests for recording reviews and updating approval rate."""

    @pytest.mark.asyncio
    async def test_record_review_updates_approval_rate(
        self, db_session: AsyncSession, workspace_id: uuid.UUID
    ):
        """Recording reviews should correctly update the approval rate."""
        service = AutopilotService()

        # Record 8 approvals without edit and 2 with edits
        for _ in range(8):
            config = await service.record_review(
                db_session, workspace_id, "linkedin_post", was_edited=False
            )
        for _ in range(2):
            config = await service.record_review(
                db_session, workspace_id, "linkedin_post", was_edited=True
            )

        assert config.total_outputs_reviewed == 10
        assert config.approved_without_edit == 8
        assert config.approval_rate == pytest.approx(0.8, abs=0.001)


class TestAutopilotEligibility:
    """Tests for autopilot eligibility checks."""

    @pytest.mark.asyncio
    async def test_check_eligibility_not_enough_reviews(
        self, db_session: AsyncSession, workspace_id: uuid.UUID
    ):
        """Eligibility should fail when not enough reviews have been completed."""
        service = AutopilotService()

        # Record only 3 reviews (default minimum is 10)
        for _ in range(3):
            await service.record_review(
                db_session, workspace_id, "twitter_thread", was_edited=False
            )

        result = await service.check_eligibility(
            db_session, workspace_id, "twitter_thread"
        )

        assert result["eligible"] is False
        assert result["reviews_completed"] == 3
        assert result["reviews_required"] == 10
        assert "more review" in result["message"]

    @pytest.mark.asyncio
    async def test_check_eligibility_rate_too_low(
        self, db_session: AsyncSession, workspace_id: uuid.UUID
    ):
        """Eligibility should fail when approval rate is below threshold."""
        service = AutopilotService()

        # Record 10 reviews: 5 approved, 5 edited (50% rate < 90% threshold)
        for _ in range(5):
            await service.record_review(
                db_session, workspace_id, "instagram_carousel", was_edited=False
            )
        for _ in range(5):
            await service.record_review(
                db_session, workspace_id, "instagram_carousel", was_edited=True
            )

        result = await service.check_eligibility(
            db_session, workspace_id, "instagram_carousel"
        )

        assert result["eligible"] is False
        assert result["current_approval_rate"] == pytest.approx(0.5, abs=0.001)
        assert result["required_approval_rate"] == 0.90
        assert "required" in result["message"]

    @pytest.mark.asyncio
    async def test_check_eligibility_passes(
        self, db_session: AsyncSession, workspace_id: uuid.UUID
    ):
        """Eligibility should pass when both review count and rate thresholds are met."""
        service = AutopilotService()

        # Record 10 reviews: 9 approved, 1 edited (90% rate = 90% threshold)
        for _ in range(9):
            await service.record_review(
                db_session, workspace_id, "linkedin_post", was_edited=False
            )
        await service.record_review(
            db_session, workspace_id, "linkedin_post", was_edited=True
        )

        result = await service.check_eligibility(
            db_session, workspace_id, "linkedin_post"
        )

        assert result["eligible"] is True
        assert result["current_approval_rate"] == pytest.approx(0.9, abs=0.001)
        assert "Eligible" in result["message"]


class TestAutopilotEnableDisable:
    """Tests for enabling and disabling autopilot."""

    @pytest.mark.asyncio
    async def test_enable_autopilot(
        self, db_session: AsyncSession, workspace_id: uuid.UUID
    ):
        """Enabling autopilot should work when eligible."""
        service = AutopilotService()

        # Build trust: 10 reviews, all approved
        for _ in range(10):
            await service.record_review(
                db_session, workspace_id, "linkedin_post", was_edited=False
            )

        config = await service.enable_autopilot(
            db_session, workspace_id, "linkedin_post"
        )

        assert config.enabled is True
        assert config.enabled_at is not None

    @pytest.mark.asyncio
    async def test_enable_autopilot_fails_when_not_eligible(
        self, db_session: AsyncSession, workspace_id: uuid.UUID
    ):
        """Enabling autopilot should raise ValidationError when not eligible."""
        service = AutopilotService()

        # Only 3 reviews — not enough
        for _ in range(3):
            await service.record_review(
                db_session, workspace_id, "twitter_thread", was_edited=False
            )

        with pytest.raises(ValidationError):
            await service.enable_autopilot(
                db_session, workspace_id, "twitter_thread"
            )

    @pytest.mark.asyncio
    async def test_disable_autopilot(
        self, db_session: AsyncSession, workspace_id: uuid.UUID
    ):
        """Disabling autopilot should work instantly."""
        service = AutopilotService()

        # Enable first
        for _ in range(10):
            await service.record_review(
                db_session, workspace_id, "linkedin_post", was_edited=False
            )
        await service.enable_autopilot(db_session, workspace_id, "linkedin_post")

        # Disable
        config = await service.disable_autopilot(
            db_session, workspace_id, "linkedin_post"
        )

        assert config.enabled is False
        assert config.disabled_at is not None


class TestAutopilotSummary:
    """Tests for the autopilot summary."""

    @pytest.mark.asyncio
    async def test_autopilot_summary(
        self, db_session: AsyncSession, workspace_id: uuid.UUID
    ):
        """Summary should aggregate status across platforms correctly."""
        service = AutopilotService()

        # Platform 1: Eligible and enabled
        for _ in range(10):
            await service.record_review(
                db_session, workspace_id, "linkedin_post", was_edited=False
            )
        await service.enable_autopilot(db_session, workspace_id, "linkedin_post")

        # Platform 2: Has reviews but not eligible (low rate)
        for _ in range(5):
            await service.record_review(
                db_session, workspace_id, "twitter_thread", was_edited=False
            )
        for _ in range(5):
            await service.record_review(
                db_session, workspace_id, "twitter_thread", was_edited=True
            )

        summary = await service.get_autopilot_summary(db_session, workspace_id)

        assert summary["total_platforms"] == 2
        assert summary["autopilot_enabled"] == 1

        # Check platform statuses
        platform_by_id = {p["platform_id"]: p for p in summary["platforms"]}
        assert platform_by_id["linkedin_post"]["status"] == "active"
        assert platform_by_id["twitter_thread"]["status"] == "building_trust"


class TestProcessAutopilotQueue:
    """Tests for autopilot queue processing."""

    @pytest.mark.asyncio
    async def test_process_autopilot_queue_no_enabled(
        self, db_session: AsyncSession, workspace_id: uuid.UUID
    ):
        """When no platforms have autopilot enabled, nothing should be scheduled."""
        service = AutopilotService()

        result = await service.process_autopilot_queue(db_session, workspace_id)
        assert result == []


# ---------------------------------------------------------------------------
# A/B Testing Service Tests
# ---------------------------------------------------------------------------


class TestABTestCreate:
    """Tests for A/B test creation."""

    @pytest.mark.asyncio
    async def test_ab_test_create(
        self,
        db_session: AsyncSession,
        content_with_outputs: ContentUpload,
    ):
        """Creating an A/B test should store both variants correctly."""
        service = ABTestingService()
        workspace_id = content_with_outputs.workspace_id

        # Get two output variants
        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_with_outputs.id,
            )
        )
        outputs = list(result.scalars().all())
        assert len(outputs) >= 2

        variant_a = outputs[0]
        variant_b = outputs[1]

        test = await service.create_test(
            db=db_session,
            workspace_id=workspace_id,
            content_upload_id=content_with_outputs.id,
            platform_id=variant_a.platform_id,
            variant_a_id=variant_a.id,
            variant_b_id=variant_b.id,
        )

        assert test.status == "pending"
        assert test.variant_a_output_id == variant_a.id
        assert test.variant_b_output_id == variant_b.id
        assert test.workspace_id == workspace_id

    @pytest.mark.asyncio
    async def test_ab_test_create_same_variant_fails(
        self,
        db_session: AsyncSession,
        content_with_outputs: ContentUpload,
    ):
        """Creating an A/B test with the same variant for both should fail."""
        service = ABTestingService()
        workspace_id = content_with_outputs.workspace_id

        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_with_outputs.id,
            ).limit(1)
        )
        output = result.scalar_one()

        with pytest.raises(ValidationError):
            await service.create_test(
                db=db_session,
                workspace_id=workspace_id,
                content_upload_id=content_with_outputs.id,
                platform_id=output.platform_id,
                variant_a_id=output.id,
                variant_b_id=output.id,
            )


class TestABTestEvaluate:
    """Tests for A/B test evaluation."""

    @pytest.mark.asyncio
    async def test_ab_test_evaluate_winner(
        self,
        db_session: AsyncSession,
        content_with_outputs: ContentUpload,
    ):
        """Evaluating a test should declare the variant with higher engagement as winner."""
        service = ABTestingService()
        workspace_id = content_with_outputs.workspace_id

        # Get two output variants
        result = await db_session.execute(
            select(GeneratedOutput).where(
                GeneratedOutput.content_upload_id == content_with_outputs.id,
            )
        )
        outputs = list(result.scalars().all())
        variant_a = outputs[0]
        variant_b = outputs[1]

        # Create analytics snapshots — variant B has higher engagement
        snapshot_a = AnalyticsSnapshot(
            generated_output_id=variant_a.id,
            workspace_id=workspace_id,
            platform_id=variant_a.platform_id,
            snapshot_time=datetime.now(timezone.utc),
            impressions=1000,
            engagements=50,
            engagement_rate=0.05,
        )
        snapshot_b = AnalyticsSnapshot(
            generated_output_id=variant_b.id,
            workspace_id=workspace_id,
            platform_id=variant_b.platform_id,
            snapshot_time=datetime.now(timezone.utc),
            impressions=1000,
            engagements=100,
            engagement_rate=0.10,
        )
        db_session.add(snapshot_a)
        db_session.add(snapshot_b)
        await db_session.flush()

        # Create and start the test
        test = await service.create_test(
            db=db_session,
            workspace_id=workspace_id,
            content_upload_id=content_with_outputs.id,
            platform_id=variant_a.platform_id,
            variant_a_id=variant_a.id,
            variant_b_id=variant_b.id,
        )
        test = await service.start_test(db_session, test.id, workspace_id)
        assert test.status == "running"

        # Evaluate
        test = await service.evaluate_test(db_session, test.id, workspace_id)

        assert test.status == "completed"
        assert test.winner_output_id == variant_b.id
        assert test.variant_a_metrics is not None
        assert test.variant_b_metrics is not None
        assert test.variant_a_metrics["engagement_rate"] == pytest.approx(0.05)
        assert test.variant_b_metrics["engagement_rate"] == pytest.approx(0.10)
        assert test.completed_at is not None


# ---------------------------------------------------------------------------
# Autopilot API Integration Tests
# ---------------------------------------------------------------------------


class TestAutopilotAPI:
    """Integration tests for autopilot API endpoints."""

    @pytest.mark.asyncio
    async def test_record_review_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test recording a review via the API."""
        response = await client.post(
            f"{AUTOPILOT_BASE}/record-review",
            json={"platform_id": "linkedin_post", "was_edited": False},
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert data["total_outputs_reviewed"] == 1
        assert data["approved_without_edit"] == 1
        assert data["approval_rate"] == 1.0

    @pytest.mark.asyncio
    async def test_get_config_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting autopilot config via the API (auto-creates if missing)."""
        response = await client.get(
            f"{AUTOPILOT_BASE}/config/linkedin_post",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert data["platform_id"] == "linkedin_post"
        assert data["enabled"] is False
        assert data["required_approval_rate"] == 0.90

    @pytest.mark.asyncio
    async def test_eligibility_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test checking eligibility via the API."""
        response = await client.get(
            f"{AUTOPILOT_BASE}/eligibility/linkedin_post",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert data["eligible"] is False
        assert data["reviews_completed"] == 0
        assert data["reviews_required"] == 10

    @pytest.mark.asyncio
    async def test_summary_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test the autopilot summary endpoint."""
        response = await client.get(
            f"{AUTOPILOT_BASE}/summary",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert "total_platforms" in data
        assert "autopilot_enabled" in data
        assert "platforms" in data

    @pytest.mark.asyncio
    async def test_update_thresholds_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test updating thresholds via the API."""
        # Create a config first
        await client.get(
            f"{AUTOPILOT_BASE}/config/linkedin_post",
            headers=auth_headers,
        )

        response = await client.patch(
            f"{AUTOPILOT_BASE}/thresholds/linkedin_post",
            json={"required_approval_rate": 0.85, "required_minimum_reviews": 8},
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert data["required_approval_rate"] == 0.85
        assert data["required_minimum_reviews"] == 8


# ---------------------------------------------------------------------------
# Security API Integration Tests
# ---------------------------------------------------------------------------


class TestSecurityAPI:
    """Integration tests for security API endpoints."""

    @pytest.mark.asyncio
    async def test_list_sessions_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing active sessions."""
        response = await client.get(
            f"{SECURITY_BASE}/sessions",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_audit_log_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting the audit log."""
        response = await client.get(
            f"{SECURITY_BASE}/audit-log",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert "items" in data
        assert "total" in data

    @pytest.mark.asyncio
    async def test_security_events_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting security events."""
        response = await client.get(
            f"{SECURITY_BASE}/events",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_panic_button_api(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test the panic button endpoint."""
        response = await client.post(
            f"{SECURITY_BASE}/panic",
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        data = response.json()
        assert data["status"] == "emergency_lockdown_complete"
        assert "connections_revoked" in data
        assert "sessions_revoked" in data
