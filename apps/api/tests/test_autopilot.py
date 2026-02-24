"""Tests for autopilot, A/B testing, and security — Firestore-backed."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from tests.conftest import FAKE_TOKEN

AUTOPILOT_BASE = "/api/v1/autopilot"
AB_TESTS_BASE = "/api/v1/ab-tests"
SECURITY_BASE = "/api/v1/security"


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
        "full_name": "Autopilot Test User",
        "is_active": True,
        "tier": "starter",
        "created_at": now,
    }
    user_doc = _make_doc("user-1", user_data)

    user_query = MagicMock()

    async def _user_stream():
        yield user_doc

    user_query.stream = _user_stream
    user_query.limit = MagicMock(return_value=user_query)

    return db, user_data, user_doc, user_query


def _empty_query():
    """Create a mock query that yields nothing."""
    q = MagicMock()

    async def _stream():
        return
        yield

    q.stream = _stream
    q.where = MagicMock(return_value=q)
    q.order_by = MagicMock(return_value=q)
    q.limit = MagicMock(return_value=q)
    return q


# ---------------------------------------------------------------------------
# Autopilot API Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_autopilot_summary(client: AsyncClient):
    """Test the autopilot summary endpoint."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    config_a = _make_doc("cfg-1", {"user_id": "user-1", "platform_id": "linkedin_post", "enabled": True})
    config_b = _make_doc("cfg-2", {"user_id": "user-1", "platform_id": "twitter_thread", "enabled": False})

    configs_query = MagicMock()

    async def _configs_stream():
        yield config_a
        yield config_b

    configs_query.stream = _configs_stream
    configs_query.where = MagicMock(return_value=configs_query)

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name == "autopilot_configs":
            coll.where = MagicMock(return_value=configs_query)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.get(
            f"{AUTOPILOT_BASE}/summary",
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["total_platforms"] == 2
    assert data["enabled_count"] == 1


@pytest.mark.asyncio
async def test_enable_autopilot(client: AsyncClient):
    """Test enabling autopilot for a platform."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    new_ref = AsyncMock()
    new_ref.id = "cfg-new"

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name == "autopilot_configs":
            coll.where = MagicMock(return_value=_empty_query())
            coll.document = MagicMock(return_value=new_ref)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.post(
            f"{AUTOPILOT_BASE}/enable",
            json={"platform_id": "linkedin_post"},
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is True
    assert data["platform_id"] == "linkedin_post"


@pytest.mark.asyncio
async def test_record_review(client: AsyncClient):
    """Test recording a content review updates trust metrics."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    config_data = {
        "user_id": "user-1",
        "platform_id": "linkedin_post",
        "enabled": True,
        "total_reviews": 5,
        "approved_reviews": 4,
        "edited_reviews": 1,
        "trust_score": 0.8,
    }
    config_doc = _make_doc("cfg-1", config_data)

    config_query = MagicMock()

    async def _config_stream():
        yield config_doc

    config_query.stream = _config_stream
    config_query.where = MagicMock(return_value=config_query)
    config_query.limit = MagicMock(return_value=config_query)

    config_ref = AsyncMock()

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name == "autopilot_configs":
            coll.where = MagicMock(return_value=config_query)
            coll.document = MagicMock(return_value=config_ref)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.post(
            f"{AUTOPILOT_BASE}/record-review",
            json={"platform_id": "linkedin_post", "was_edited": False},
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["total_reviews"] == 6
    assert data["approved_reviews"] == 5


# ---------------------------------------------------------------------------
# A/B Testing API Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_ab_test(client: AsyncClient):
    """Test creating an A/B test."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    new_ref = AsyncMock()
    new_ref.id = "test-1"

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name == "ab_tests":
            coll.document = MagicMock(return_value=new_ref)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.post(
            AB_TESTS_BASE,
            json={
                "content_upload_id": "content-1",
                "platform_id": "linkedin_post",
                "variant_a_output_id": "output-a",
                "variant_b_output_id": "output-b",
            },
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "draft"
    assert data["variant_a_output_id"] == "output-a"
    assert data["variant_b_output_id"] == "output-b"


@pytest.mark.asyncio
async def test_list_ab_tests(client: AsyncClient):
    """Test listing A/B tests."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    test_doc = _make_doc("t-1", {
        "user_id": "user-1", "status": "draft", "platform_id": "linkedin_post",
        "variant_a_output_id": "a", "variant_b_output_id": "b",
    })

    tests_query = MagicMock()

    async def _tests_stream():
        yield test_doc

    tests_query.stream = _tests_stream
    tests_query.where = MagicMock(return_value=tests_query)

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name == "ab_tests":
            coll.where = MagicMock(return_value=tests_query)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.get(
            AB_TESTS_BASE,
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["status"] == "draft"


# ---------------------------------------------------------------------------
# Security API Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_sessions(client: AsyncClient):
    """Test listing active sessions."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    sessions_query = MagicMock()

    async def _sessions_stream():
        return
        yield

    sessions_query.stream = _sessions_stream
    sessions_query.where = MagicMock(return_value=sessions_query)
    sessions_query.order_by = MagicMock(return_value=sessions_query)

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name == "sessions":
            coll.where = MagicMock(return_value=sessions_query)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.get(
            f"{SECURITY_BASE}/sessions",
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_audit_log(client: AsyncClient):
    """Test getting the audit log."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    audit_query = MagicMock()

    async def _audit_stream():
        return
        yield

    audit_query.stream = _audit_stream
    audit_query.where = MagicMock(return_value=audit_query)
    audit_query.order_by = MagicMock(return_value=audit_query)

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name == "audit_logs":
            coll.where = MagicMock(return_value=audit_query)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.get(
            f"{SECURITY_BASE}/audit-log",
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_panic_button(client: AsyncClient):
    """Test the panic button endpoint."""
    db, user_data, user_doc, user_query = _mock_db_with_user()

    audit_ref = AsyncMock()

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.where = MagicMock(return_value=user_query)
        elif name in ("connected_platforms", "sessions", "autopilot_configs"):
            coll.where = MagicMock(return_value=_empty_query())
        elif name == "audit_logs":
            coll.document = MagicMock(return_value=audit_ref)
        return coll

    db.collection = _collection

    with patch("app.core.firestore.get_db", return_value=db), \
         patch("app.middleware.auth.get_db", return_value=db):
        response = await client.post(
            f"{SECURITY_BASE}/panic",
            headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "emergency_lockdown_complete"
    assert "connections_revoked" in data
    assert "sessions_revoked" in data
