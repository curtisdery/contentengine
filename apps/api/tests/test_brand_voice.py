"""Tests for brand voice profile API — Firestore-backed CRUD operations."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from tests.conftest import FAKE_TOKEN

PROFILES_URL = "/api/v1/voice/profiles"
ANALYZE_URL = "/api/v1/voice/analyze-samples"


def _make_doc(doc_id: str, data: dict):
    doc = MagicMock()
    doc.id = doc_id
    doc.exists = True
    doc.to_dict.return_value = data
    return doc


def _mock_db_with_user():
    """Create a mock Firestore DB with a test user."""
    db = MagicMock()
    now = datetime.now(timezone.utc)

    user_data = {
        "email": "test@example.com",
        "firebase_uid": "test_firebase_uid_12345",
        "full_name": "Test User",
        "is_active": True,
        "tier": "starter",
        "created_at": now,
    }
    user_doc = _make_doc("user-1", user_data)

    # User lookup by firebase_uid
    user_query = MagicMock()

    async def _user_stream():
        yield user_doc

    user_query.stream = _user_stream
    user_query.limit = MagicMock(return_value=user_query)

    return db, user_data, user_doc, user_query


@pytest.mark.asyncio
async def test_create_voice_profile(client: AsyncClient):
    """Test creating a new voice profile."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    # Voice profiles collection — empty initially
    profiles_query = MagicMock()

    async def _empty_stream():
        return
        yield

    profiles_query.stream = _empty_stream
    profiles_query.where = MagicMock(return_value=profiles_query)

    new_ref = AsyncMock()
    new_ref.id = "profile-1"

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name == "voice_profiles":
            coll.where = MagicMock(return_value=profiles_query)
            coll.document = MagicMock(return_value=new_ref)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.post(
            PROFILES_URL,
            json={"name": "Bold Creator Voice", "tone_attributes": ["bold", "direct"]},
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Bold Creator Voice"
    assert data["tone_attributes"] == ["bold", "direct"]


@pytest.mark.asyncio
async def test_list_voice_profiles(client: AsyncClient):
    """Test listing voice profiles."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    profile_a = _make_doc("p-a", {"user_id": "user-1", "name": "Profile A", "tone_attributes": ["bold"]})
    profile_b = _make_doc("p-b", {"user_id": "user-1", "name": "Profile B", "tone_attributes": ["warm"]})

    profiles_query = MagicMock()

    async def _profiles_stream():
        yield profile_a
        yield profile_b

    profiles_query.stream = _profiles_stream
    profiles_query.where = MagicMock(return_value=profiles_query)

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name == "voice_profiles":
            coll.where = MagicMock(return_value=profiles_query)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.get(
            PROFILES_URL,
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    names = {p["name"] for p in data}
    assert "Profile A" in names
    assert "Profile B" in names


@pytest.mark.asyncio
async def test_get_voice_profile(client: AsyncClient):
    """Test getting a single voice profile by ID."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    profile_data = {"user_id": "user-1", "name": "Specific Profile", "tone_attributes": ["warm"]}
    profile_doc = _make_doc("p-1", profile_data)

    profile_ref = AsyncMock()
    profile_ref.get = AsyncMock(return_value=profile_doc)

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name == "voice_profiles":
            coll.document = MagicMock(return_value=profile_ref)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.get(
            f"{PROFILES_URL}/p-1",
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Specific Profile"


@pytest.mark.asyncio
async def test_get_voice_profile_not_found(client: AsyncClient):
    """Test getting a non-existent voice profile returns 404."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    missing_doc = MagicMock()
    missing_doc.exists = False

    profile_ref = AsyncMock()
    profile_ref.get = AsyncMock(return_value=missing_doc)

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name == "voice_profiles":
            coll.document = MagicMock(return_value=profile_ref)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.get(
            f"{PROFILES_URL}/nonexistent",
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_voice_profile(client: AsyncClient):
    """Test deleting a voice profile."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    profile_data = {"user_id": "user-1", "name": "To Delete"}
    profile_doc = _make_doc("p-del", profile_data)

    profile_ref = AsyncMock()
    profile_ref.get = AsyncMock(return_value=profile_doc)

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name == "voice_profiles":
            coll.document = MagicMock(return_value=profile_ref)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.delete(
            f"{PROFILES_URL}/p-del",
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_analyze_samples(client: AsyncClient):
    """Test the analyze-samples endpoint returns voice characteristics."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.post(
            ANALYZE_URL,
            json={"samples": ["Here's the thing about growth.", "Most people get this wrong."]},
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert "tone_metrics" in data
    assert data["samples_analyzed"] == 2


@pytest.mark.asyncio
async def test_voice_profile_unauthorized(client: AsyncClient):
    """Test that unauthenticated requests are rejected."""
    response = await client.get(PROFILES_URL)
    assert response.status_code in (401, 403)
