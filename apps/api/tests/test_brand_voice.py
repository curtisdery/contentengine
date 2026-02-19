"""Tests for brand voice profile API — CRUD operations."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand_voice import BrandVoiceProfile
from app.models.organization import Organization, OrganizationMember, Workspace
from app.models.user import User
from app.utils.security import hash_password, create_access_token  # create_access_token(user_id: UUID)


PROFILES_URL = "/api/v1/voice/profiles"
ANALYZE_URL = "/api/v1/voice/analyze-samples"

# Mock AI analysis response so tests don't require an API key
MOCK_VOICE_ANALYSIS = {
    "tone_metrics": {
        "formality": 0.3,
        "humor": 0.6,
        "vulnerability": 0.4,
        "directness": 0.8,
        "jargon_density": 0.2,
    },
    "vocabulary_patterns": {
        "common_words": ["growth", "impact"],
        "sentence_starters": ["Here's the thing"],
        "transitions": ["But here's what matters"],
        "emphasis_patterns": ["bold claims"],
    },
    "avg_sentence_length": 12,
    "active_voice_ratio": 0.75,
    "signature_phrases": ["let's be real", "here's the deal"],
    "suggested_attributes": ["bold", "direct", "warm"],
}


async def create_test_user_with_workspace(db: AsyncSession) -> tuple[User, Workspace, str]:
    """Helper to create a test user with org, workspace, and auth token."""
    user = User(
        id=uuid.uuid4(),
        email=f"voicetest_{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("securepassword123"),
        full_name="Voice Test User",
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    await db.flush()

    org = Organization(
        id=uuid.uuid4(),
        name="Test Org",
        slug=f"test-org-{uuid.uuid4().hex[:8]}",
        owner_id=user.id,
    )
    db.add(org)
    await db.flush()

    member = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        role="owner",
    )
    db.add(member)
    await db.flush()

    workspace = Workspace(
        id=uuid.uuid4(),
        organization_id=org.id,
        name="Default Workspace",
        slug="default",
    )
    db.add(workspace)
    await db.flush()

    token = create_access_token(user_id=user.id)

    return user, workspace, token


@pytest.mark.asyncio
@patch("app.services.brand_voice.ai_service.analyze_voice_samples", new_callable=AsyncMock)
async def test_create_voice_profile(mock_analyze, client: AsyncClient, db_session: AsyncSession):
    """Test creating a new voice profile."""
    mock_analyze.return_value = MOCK_VOICE_ANALYSIS
    user, workspace, token = await create_test_user_with_workspace(db_session)

    payload = {
        "profile_name": "Bold Creator Voice",
        "voice_attributes": ["bold", "direct", "warm"],
        "sample_content": ["Here's the thing about growth..."],
        "banned_terms": ["synergy", "leverage"],
        "cta_library": ["Follow for more", "Share if you agree"],
        "is_default": True,
    }

    response = await client.post(
        PROFILES_URL,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["profile_name"] == "Bold Creator Voice"
    assert data["voice_attributes"] == ["bold", "direct", "warm"]
    assert data["is_default"] is True
    assert data["workspace_id"] == str(workspace.id)
    assert "tone_metrics" in data


@pytest.mark.asyncio
@patch("app.services.brand_voice.ai_service.analyze_voice_samples", new_callable=AsyncMock)
async def test_list_voice_profiles(mock_analyze, client: AsyncClient, db_session: AsyncSession):
    """Test listing voice profiles for a workspace."""
    mock_analyze.return_value = MOCK_VOICE_ANALYSIS
    user, workspace, token = await create_test_user_with_workspace(db_session)

    # Create two profiles
    for name in ["Profile A", "Profile B"]:
        profile = BrandVoiceProfile(
            id=uuid.uuid4(),
            workspace_id=workspace.id,
            profile_name=name,
            voice_attributes=["bold"],
            sample_content=[],
            tone_metrics={},
            vocabulary={},
            formatting_config={},
            cta_library=[],
            topic_boundaries={},
            is_default=False,
        )
        db_session.add(profile)
    await db_session.flush()

    response = await client.get(
        PROFILES_URL,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    names = {p["profile_name"] for p in data}
    assert "Profile A" in names
    assert "Profile B" in names


@pytest.mark.asyncio
@patch("app.services.brand_voice.ai_service.analyze_voice_samples", new_callable=AsyncMock)
async def test_get_voice_profile(mock_analyze, client: AsyncClient, db_session: AsyncSession):
    """Test getting a single voice profile by ID."""
    mock_analyze.return_value = MOCK_VOICE_ANALYSIS
    user, workspace, token = await create_test_user_with_workspace(db_session)

    profile = BrandVoiceProfile(
        id=uuid.uuid4(),
        workspace_id=workspace.id,
        profile_name="Specific Profile",
        voice_attributes=["warm"],
        sample_content=[],
        tone_metrics={"formality": 0.5},
        vocabulary={"patterns": {}},
        formatting_config={},
        cta_library=["DM me"],
        topic_boundaries={"approved": ["startups"]},
        is_default=True,
    )
    db_session.add(profile)
    await db_session.flush()

    response = await client.get(
        f"{PROFILES_URL}/{profile.id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["profile_name"] == "Specific Profile"
    assert data["is_default"] is True
    assert data["cta_library"] == ["DM me"]


@pytest.mark.asyncio
@patch("app.services.brand_voice.ai_service.analyze_voice_samples", new_callable=AsyncMock)
async def test_get_voice_profile_not_found(mock_analyze, client: AsyncClient, db_session: AsyncSession):
    """Test getting a non-existent voice profile returns 404."""
    mock_analyze.return_value = MOCK_VOICE_ANALYSIS
    user, workspace, token = await create_test_user_with_workspace(db_session)

    fake_id = uuid.uuid4()
    response = await client.get(
        f"{PROFILES_URL}/{fake_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404


@pytest.mark.asyncio
@patch("app.services.brand_voice.ai_service.analyze_voice_samples", new_callable=AsyncMock)
async def test_update_voice_profile(mock_analyze, client: AsyncClient, db_session: AsyncSession):
    """Test updating a voice profile."""
    mock_analyze.return_value = MOCK_VOICE_ANALYSIS
    user, workspace, token = await create_test_user_with_workspace(db_session)

    profile = BrandVoiceProfile(
        id=uuid.uuid4(),
        workspace_id=workspace.id,
        profile_name="Original Name",
        voice_attributes=["bold"],
        sample_content=[],
        tone_metrics={},
        vocabulary={},
        formatting_config={},
        cta_library=[],
        topic_boundaries={},
        is_default=False,
    )
    db_session.add(profile)
    await db_session.flush()

    update_payload = {
        "profile_name": "Updated Name",
        "voice_attributes": ["warm", "direct"],
        "is_default": True,
    }

    response = await client.patch(
        f"{PROFILES_URL}/{profile.id}",
        json=update_payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["profile_name"] == "Updated Name"
    assert data["voice_attributes"] == ["warm", "direct"]
    assert data["is_default"] is True


@pytest.mark.asyncio
@patch("app.services.brand_voice.ai_service.analyze_voice_samples", new_callable=AsyncMock)
async def test_delete_voice_profile(mock_analyze, client: AsyncClient, db_session: AsyncSession):
    """Test deleting a voice profile."""
    mock_analyze.return_value = MOCK_VOICE_ANALYSIS
    user, workspace, token = await create_test_user_with_workspace(db_session)

    profile = BrandVoiceProfile(
        id=uuid.uuid4(),
        workspace_id=workspace.id,
        profile_name="To Delete",
        voice_attributes=[],
        sample_content=[],
        tone_metrics={},
        vocabulary={},
        formatting_config={},
        cta_library=[],
        topic_boundaries={},
        is_default=False,
    )
    db_session.add(profile)
    await db_session.flush()

    # Delete
    response = await client.delete(
        f"{PROFILES_URL}/{profile.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 204

    # Verify it's gone
    response = await client.get(
        f"{PROFILES_URL}/{profile.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
@patch("app.services.brand_voice.ai_service.analyze_voice_samples", new_callable=AsyncMock)
async def test_delete_voice_profile_not_found(mock_analyze, client: AsyncClient, db_session: AsyncSession):
    """Test deleting a non-existent voice profile returns 404."""
    mock_analyze.return_value = MOCK_VOICE_ANALYSIS
    user, workspace, token = await create_test_user_with_workspace(db_session)

    fake_id = uuid.uuid4()
    response = await client.delete(
        f"{PROFILES_URL}/{fake_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
@patch("app.services.brand_voice.ai_service.analyze_voice_samples", new_callable=AsyncMock)
async def test_analyze_samples_endpoint(mock_analyze, client: AsyncClient, db_session: AsyncSession):
    """Test the analyze-samples endpoint returns voice characteristics."""
    mock_analyze.return_value = MOCK_VOICE_ANALYSIS
    user, workspace, token = await create_test_user_with_workspace(db_session)

    payload = {
        "samples": [
            "Here's the thing about building in public. It's not about the vanity metrics.",
            "Most founders get this wrong. They think growth hacking is the answer.",
        ]
    }

    response = await client.post(
        ANALYZE_URL,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "tone_metrics" in data
    assert "vocabulary_patterns" in data
    assert "signature_phrases" in data
    assert "suggested_attributes" in data


@pytest.mark.asyncio
@patch("app.services.brand_voice.ai_service.analyze_voice_samples", new_callable=AsyncMock)
async def test_create_default_unsets_others(mock_analyze, client: AsyncClient, db_session: AsyncSession):
    """Test that creating a default profile unsets other defaults."""
    mock_analyze.return_value = MOCK_VOICE_ANALYSIS
    user, workspace, token = await create_test_user_with_workspace(db_session)

    # Create first default profile
    first = BrandVoiceProfile(
        id=uuid.uuid4(),
        workspace_id=workspace.id,
        profile_name="First Default",
        voice_attributes=[],
        sample_content=[],
        tone_metrics={},
        vocabulary={},
        formatting_config={},
        cta_library=[],
        topic_boundaries={},
        is_default=True,
    )
    db_session.add(first)
    await db_session.flush()

    # Create second default profile via API
    payload = {
        "profile_name": "Second Default",
        "is_default": True,
    }

    response = await client.post(
        PROFILES_URL,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["is_default"] is True

    # List profiles and verify only one is default
    response = await client.get(
        PROFILES_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    profiles = response.json()
    defaults = [p for p in profiles if p["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["profile_name"] == "Second Default"


@pytest.mark.asyncio
async def test_voice_profile_unauthorized(client: AsyncClient):
    """Test that unauthenticated requests to voice endpoints are rejected."""
    response = await client.get(PROFILES_URL)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_voice_profile_validation(client: AsyncClient, db_session: AsyncSession):
    """Test that invalid payloads are rejected with 422."""
    user, workspace, token = await create_test_user_with_workspace(db_session)

    # Missing required profile_name
    payload = {
        "voice_attributes": ["bold"],
    }

    response = await client.post(
        PROFILES_URL,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422
