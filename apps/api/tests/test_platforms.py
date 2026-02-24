"""Tests for platform OAuth services and connections — Firestore-backed."""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.platforms.base import BasePlatform, get_platform_service
from app.utils.exceptions import ValidationError, NotFoundError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_doc(data: dict, doc_id: str = "doc_1"):
    doc = MagicMock()
    doc.exists = True
    doc.id = doc_id
    doc.to_dict.return_value = data
    doc.reference = MagicMock()
    doc.reference.update = AsyncMock()
    doc.reference.delete = AsyncMock()
    return doc


def _make_missing_doc():
    doc = MagicMock()
    doc.exists = False
    return doc


def _mock_db():
    """Return a mock Firestore db with configurable collection behavior."""
    db = MagicMock()
    db.collection.return_value = MagicMock()
    return db


def _setup_collection(db, collection_name, doc=None, doc_id=None):
    """Configure a mock collection to return a specific document on .document().get()."""
    collection = MagicMock()
    doc_ref = MagicMock()
    doc_ref.get = AsyncMock(return_value=doc or _make_missing_doc())
    doc_ref.set = AsyncMock()
    doc_ref.update = AsyncMock()
    doc_ref.delete = AsyncMock()
    collection.document.return_value = doc_ref

    # Make db.collection(name) return this collection
    original = db.collection.side_effect

    def route_collection(name):
        if name == collection_name:
            return collection
        if original:
            return original(name)
        return MagicMock()

    db.collection.side_effect = route_collection
    return collection, doc_ref


def _setup_query_stream(collection, docs: list):
    """Configure a mock collection's .where().limit().stream() to yield docs."""
    async def fake_stream():
        for d in docs:
            yield d

    query = MagicMock()
    query.stream = fake_stream
    query.limit.return_value = query

    where_mock = MagicMock(return_value=query)
    where_mock.where = where_mock
    where_mock.limit = MagicMock(return_value=query)
    where_mock.stream = fake_stream

    collection.where.return_value = where_mock
    return query


# ---------------------------------------------------------------------------
# test_oauth_url_stores_state_in_firestore
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_oauth_url_stores_state_in_firestore():
    """get_auth_url should store OAuth state doc in Firestore oauth_states collection."""
    db = _mock_db()
    oauth_collection, doc_ref = _setup_collection(db, "oauth_states")

    with patch("app.services.platforms.base.get_db", return_value=db), \
         patch("app.services.platforms.base.settings") as mock_settings:
        mock_settings.TWITTER_CLIENT_ID = "test_client_id"
        mock_settings.BACKEND_URL = "https://api.test.com"

        from app.services.platforms.twitter import TwitterPlatform
        service = TwitterPlatform()
        url = await service.get_auth_url(user_id="user_123")

    assert "twitter.com" in url
    assert "client_id=test_client_id" in url
    assert "code_challenge" in url  # PKCE
    # Verify state was stored
    doc_ref.set.assert_called_once()
    stored = doc_ref.set.call_args[0][0]
    assert stored["user_id"] == "user_123"
    assert stored["platform"] == "twitter"
    assert stored["code_verifier"] is not None
    assert "expires_at" in stored


# ---------------------------------------------------------------------------
# test_callback_validates_state
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_callback_validates_state():
    """exchange_code should raise ValidationError if state doc doesn't exist."""
    db = _mock_db()
    oauth_collection, doc_ref = _setup_collection(db, "oauth_states", doc=_make_missing_doc())

    with patch("app.services.platforms.base.get_db", return_value=db):
        from app.services.platforms.twitter import TwitterPlatform
        service = TwitterPlatform()

        with pytest.raises(ValidationError) as exc_info:
            await service.exchange_code(code="auth_code", state="invalid_state")

    assert "invalid or expired" in exc_info.value.detail.lower()


# ---------------------------------------------------------------------------
# test_callback_encrypts_tokens
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_callback_encrypts_tokens():
    """exchange_code should encrypt access and refresh tokens before storing."""
    db = _mock_db()

    # Setup oauth_states to return a valid state doc
    state_data = {
        "user_id": "user_123",
        "platform": "linkedin",
        "code_verifier": None,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(minutes=10),
    }
    state_doc = _make_doc(state_data, "valid_state")
    oauth_collection, state_ref = _setup_collection(db, "oauth_states", doc=state_doc)

    # Setup connected_platforms — no existing connection
    platforms_collection = MagicMock()
    _setup_query_stream(platforms_collection, [])
    platforms_collection.add = AsyncMock(return_value=(None, MagicMock(id="new_conn_id")))

    def route(name):
        if name == "oauth_states":
            return oauth_collection
        if name == "connected_platforms":
            return platforms_collection
        return MagicMock()
    db.collection.side_effect = route

    # Mock httpx for token exchange and profile fetch
    mock_token_resp = MagicMock()
    mock_token_resp.status_code = 200
    mock_token_resp.json.return_value = {
        "access_token": "real_access_token",
        "refresh_token": "real_refresh_token",
        "expires_in": 3600,
    }

    mock_profile_resp = MagicMock()
    mock_profile_resp.status_code = 200
    mock_profile_resp.json.return_value = {"sub": "li_123", "name": "Test User"}

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_token_resp)
    mock_client.get = AsyncMock(return_value=mock_profile_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.platforms.base.get_db", return_value=db), \
         patch("app.services.platforms.base.settings") as mock_settings, \
         patch("app.services.platforms.base.httpx.AsyncClient", return_value=mock_client), \
         patch("app.services.platforms.linkedin.httpx.AsyncClient", return_value=mock_client), \
         patch("app.services.platforms.base.encrypt") as mock_encrypt:
        mock_settings.LINKEDIN_CLIENT_ID = "li_client"
        mock_settings.LINKEDIN_CLIENT_SECRET = "li_secret"
        mock_settings.BACKEND_URL = "https://api.test.com"
        mock_encrypt.side_effect = lambda x: f"encrypted:{x}"

        from app.services.platforms.linkedin import LinkedInPlatform
        service = LinkedInPlatform()
        result = await service.exchange_code(code="auth_code", state="valid_state")

    assert result["status"] == "connected"
    # Verify encrypt was called with real tokens
    mock_encrypt.assert_any_call("real_access_token")
    mock_encrypt.assert_any_call("real_refresh_token")

    # Verify stored data has encrypted tokens
    stored = platforms_collection.add.call_args[0][0]
    assert stored["access_token_encrypted"] == "encrypted:real_access_token"
    assert stored["refresh_token_encrypted"] == "encrypted:real_refresh_token"


# ---------------------------------------------------------------------------
# test_list_never_returns_tokens
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_never_returns_tokens():
    """list_connections endpoint should never include encrypted tokens in response."""
    from app.api.v1.connections import list_connections

    conn_data = {
        "platform": "twitter",
        "user_id": "user_123",
        "platform_user_id": "tw_456",
        "platform_username": "testuser",
        "access_token_encrypted": "encrypted:secret_token",
        "refresh_token_encrypted": "encrypted:secret_refresh",
        "is_active": True,
        "token_expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "scopes": ["tweet.read", "tweet.write"],
        "created_at": datetime.utcnow(),
    }
    doc = _make_doc(conn_data, "conn_1")

    db = _mock_db()
    collection = MagicMock()

    async def fake_stream():
        yield doc
    query = MagicMock()
    query.stream = fake_stream
    collection.where.return_value = query

    mock_user = MagicMock()
    mock_user.id = "user_123"

    with patch("app.api.v1.connections.get_db", return_value=db), \
         patch("app.api.v1.connections.get_current_user", return_value=mock_user):
        db.collection.return_value = collection

        result = await list_connections(current_user=mock_user)

    assert len(result) == 1
    item = result[0]
    assert "access_token_encrypted" not in item
    assert "refresh_token_encrypted" not in item
    assert item["platform"] == "twitter"
    assert item["platform_username"] == "testuser"


# ---------------------------------------------------------------------------
# test_disconnect_revokes_and_deletes
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_disconnect_revokes_and_deletes():
    """disconnect_platform should set is_active=False on the connection."""
    from app.api.v1.connections import disconnect_platform

    conn_data = {
        "user_id": "user_123",
        "platform": "instagram",
        "is_active": True,
    }
    doc = _make_doc(conn_data, "conn_ig")

    db = _mock_db()
    collection = MagicMock()

    async def fake_stream():
        yield doc

    query = MagicMock()
    query.stream = fake_stream
    query.limit.return_value = query
    where_mock = MagicMock(return_value=query)
    where_mock.where = where_mock
    where_mock.limit = MagicMock(return_value=query)
    collection.where.return_value = where_mock

    mock_user = MagicMock()
    mock_user.id = "user_123"

    with patch("app.api.v1.connections.get_db", return_value=db):
        db.collection.return_value = collection
        await disconnect_platform(platform_id="instagram", current_user=mock_user)

    doc.reference.update.assert_called_once()
    update_args = doc.reference.update.call_args[0][0]
    assert update_args["is_active"] is False


# ---------------------------------------------------------------------------
# test_refresh_updates_tokens
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_refresh_updates_tokens():
    """refresh_token should update encrypted tokens in Firestore."""
    conn_data = {
        "user_id": "user_123",
        "platform": "youtube",
        "refresh_token_encrypted": "encrypted:old_refresh",
        "is_active": True,
    }
    doc = _make_doc(conn_data, "conn_yt")
    doc_ref = MagicMock()
    doc_ref.get = AsyncMock(return_value=doc)
    doc_ref.update = AsyncMock()

    db = _mock_db()
    collection = MagicMock()
    collection.document.return_value = doc_ref
    db.collection.return_value = collection

    mock_token_resp = MagicMock()
    mock_token_resp.status_code = 200
    mock_token_resp.json.return_value = {
        "access_token": "new_access",
        "refresh_token": "new_refresh",
        "expires_in": 3600,
    }
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_token_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.platforms.base.get_db", return_value=db), \
         patch("app.services.platforms.base.settings") as mock_settings, \
         patch("app.services.platforms.base.httpx.AsyncClient", return_value=mock_client), \
         patch("app.services.platforms.base.decrypt", return_value="old_refresh"), \
         patch("app.services.platforms.base.encrypt") as mock_encrypt:
        mock_settings.YOUTUBE_CLIENT_ID = "yt_client"
        mock_settings.YOUTUBE_CLIENT_SECRET = "yt_secret"
        mock_encrypt.side_effect = lambda x: f"encrypted:{x}"

        from app.services.platforms.youtube import YouTubePlatform
        service = YouTubePlatform()
        result = await service.refresh_token("conn_yt")

    assert result["status"] == "refreshed"
    doc_ref.update.assert_called_once()
    updates = doc_ref.update.call_args[0][0]
    assert updates["access_token_encrypted"] == "encrypted:new_access"
    assert updates["refresh_token_encrypted"] == "encrypted:new_refresh"


# ---------------------------------------------------------------------------
# test_refresh_marks_inactive_on_failure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_refresh_marks_inactive_on_failure():
    """refresh_token should raise ValidationError when the provider rejects the refresh."""
    conn_data = {
        "user_id": "user_123",
        "platform": "tiktok",
        "refresh_token_encrypted": "encrypted:dead_refresh",
        "is_active": True,
    }
    doc = _make_doc(conn_data, "conn_tt")
    doc_ref = MagicMock()
    doc_ref.get = AsyncMock(return_value=doc)
    doc_ref.update = AsyncMock()

    db = _mock_db()
    collection = MagicMock()
    collection.document.return_value = doc_ref
    db.collection.return_value = collection

    mock_token_resp = MagicMock()
    mock_token_resp.status_code = 401
    mock_token_resp.text = "invalid_grant"
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_token_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.platforms.base.get_db", return_value=db), \
         patch("app.services.platforms.base.settings") as mock_settings, \
         patch("app.services.platforms.base.httpx.AsyncClient", return_value=mock_client), \
         patch("app.services.platforms.base.decrypt", return_value="dead_refresh"):
        mock_settings.TIKTOK_CLIENT_KEY = "tt_key"
        mock_settings.TIKTOK_CLIENT_SECRET = "tt_secret"

        from app.services.platforms.tiktok import TikTokPlatform
        service = TikTokPlatform()

        with pytest.raises(ValidationError) as exc_info:
            await service.refresh_token("conn_tt")

    assert "refresh" in exc_info.value.detail.lower()


# ---------------------------------------------------------------------------
# test_tier_limits_platform_count
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tier_limits_platform_count():
    """FREE tier should be limited to 2 platforms, PRO should be unlimited."""
    from app.services.billing import TIER_LIMITS, check_usage_limit

    # Verify tier config
    assert TIER_LIMITS["FREE"]["platforms"] == 2
    assert TIER_LIMITS["STARTER"]["platforms"] == 3
    assert TIER_LIMITS["GROWTH"]["platforms"] == 5
    assert TIER_LIMITS["PRO"]["platforms"] == -1  # unlimited

    # FREE user at limit (2 platforms connected)
    free_user = {
        "subscription_tier": "FREE",
        "usage_this_period": {"platforms": 2},
    }
    doc = _make_doc(free_user)
    doc_ref = MagicMock()
    doc_ref.get = AsyncMock(return_value=doc)
    collection = MagicMock()
    collection.document.return_value = doc_ref
    db = _mock_db()
    db.collection.return_value = collection

    with patch("app.services.billing.get_db", return_value=db):
        allowed = await check_usage_limit("user_1", "platforms")
    assert allowed is False

    # PRO user — always allowed
    pro_user = {
        "subscription_tier": "PRO",
        "usage_this_period": {"platforms": 999},
    }
    doc_pro = _make_doc(pro_user)
    doc_ref_pro = MagicMock()
    doc_ref_pro.get = AsyncMock(return_value=doc_pro)
    collection_pro = MagicMock()
    collection_pro.document.return_value = doc_ref_pro
    db_pro = _mock_db()
    db_pro.collection.return_value = collection_pro

    with patch("app.services.billing.get_db", return_value=db_pro):
        allowed = await check_usage_limit("user_2", "platforms")
    assert allowed is True
