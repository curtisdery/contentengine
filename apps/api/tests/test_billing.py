"""Tests for Firestore-backed billing service and tier enforcement."""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.billing import (
    TIER_LIMITS,
    TIER_RANK,
    create_checkout_session,
    create_portal_session,
    get_billing_status,
    handle_checkout_completed,
    handle_subscription_updated,
    handle_subscription_deleted,
    handle_invoice_payment_failed,
    handle_invoice_paid,
    check_tier_limit,
    increment_usage,
    check_and_increment,
)


# ---------------------------------------------------------------------------
# Helpers — fake Firestore document / collection
# ---------------------------------------------------------------------------

def _make_user_doc(data: dict):
    """Create a mock Firestore document snapshot."""
    doc = MagicMock()
    doc.id = "user-1"
    doc.exists = True
    doc.to_dict.return_value = data
    doc.reference = MagicMock()
    doc.reference.update = AsyncMock()
    return doc


def _mock_db_with_user(user_data: dict):
    """Return a mock Firestore db where users/{id}.get() returns user_data."""
    doc = _make_user_doc(user_data)
    doc_ref = MagicMock()
    doc_ref.get = AsyncMock(return_value=doc)
    doc_ref.update = AsyncMock()
    doc_ref.set = AsyncMock()

    collection = MagicMock()
    collection.document.return_value = doc_ref

    db = MagicMock()
    db.collection.return_value = collection
    return db, doc_ref


def _mock_db_with_query_results(user_data: dict | None):
    """Return a mock db where .where().limit().stream() yields user_data or nothing."""
    db = MagicMock()

    if user_data:
        doc = _make_user_doc(user_data)
        doc.reference = MagicMock()
        doc.reference.update = AsyncMock()

        async def fake_stream():
            yield doc

        query = MagicMock()
        query.stream = fake_stream
    else:
        async def fake_stream():
            return
            yield

        query = MagicMock()
        query.stream = fake_stream

    limit_mock = MagicMock(return_value=query)
    where_mock = MagicMock()
    where_mock.limit = limit_mock

    collection = MagicMock()
    collection.where.return_value = where_mock
    db.collection.return_value = collection
    return db


BASE_USER = {
    "email": "test@example.com",
    "display_name": "Test User",
    "subscription_tier": "FREE",
    "subscription_status": "active",
    "stripe_customer_id": None,
    "stripe_subscription_id": None,
    "current_period_end": None,
    "trial_ends_at": None,
    "usage_this_period": {
        "content_uploads": 0,
        "generations_run": 0,
        "outputs_generated": 0,
        "posts_published": 0,
    },
}


# ---------------------------------------------------------------------------
# Checkout tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_checkout_creates_stripe_customer():
    """When user has no stripe_customer_id, a new Stripe customer is created."""
    db, doc_ref = _mock_db_with_user({**BASE_USER})

    fake_customer = MagicMock()
    fake_customer.id = "cus_new_123"
    fake_session = MagicMock()
    fake_session.url = "https://checkout.stripe.com/sess_123"
    fake_session.id = "sess_123"

    with patch("app.services.billing.get_db", return_value=db), \
         patch("app.services.billing.stripe") as mock_stripe:
        mock_stripe.Customer.create.return_value = fake_customer
        mock_stripe.checkout.Session.create.return_value = fake_session

        result = await create_checkout_session(
            user_id="user-1",
            tier="GROWTH",
            period="monthly",
        )

    assert result["checkout_url"] == "https://checkout.stripe.com/sess_123"
    assert result["session_id"] == "sess_123"
    mock_stripe.Customer.create.assert_called_once()


@pytest.mark.asyncio
async def test_create_checkout_reuses_existing_customer():
    """When user already has stripe_customer_id, no new customer is created."""
    user = {**BASE_USER, "stripe_customer_id": "cus_existing_456"}
    db, doc_ref = _mock_db_with_user(user)

    fake_session = MagicMock()
    fake_session.url = "https://checkout.stripe.com/sess_456"
    fake_session.id = "sess_456"

    with patch("app.services.billing.get_db", return_value=db), \
         patch("app.services.billing.stripe") as mock_stripe:
        mock_stripe.checkout.Session.create.return_value = fake_session

        result = await create_checkout_session(
            user_id="user-1",
            tier="GROWTH",
            period="annual",
        )

    assert result["checkout_url"] == "https://checkout.stripe.com/sess_456"
    mock_stripe.Customer.create.assert_not_called()


@pytest.mark.asyncio
async def test_create_checkout_invalid_tier():
    """Invalid tier should raise ValueError."""
    db, _ = _mock_db_with_user({**BASE_USER})

    with patch("app.services.billing.get_db", return_value=db), \
         pytest.raises(ValueError, match="No price configured"):
        await create_checkout_session(
            user_id="user-1",
            tier="NONEXISTENT",
            period="monthly",
        )


@pytest.mark.asyncio
async def test_create_checkout_growth_gets_trial():
    """GROWTH tier checkout should include a 7-day trial."""
    user = {**BASE_USER, "stripe_customer_id": "cus_trial"}
    db, _ = _mock_db_with_user(user)

    fake_session = MagicMock()
    fake_session.url = "https://checkout.stripe.com/trial"
    fake_session.id = "sess_trial"

    with patch("app.services.billing.get_db", return_value=db), \
         patch("app.services.billing.stripe") as mock_stripe:
        mock_stripe.checkout.Session.create.return_value = fake_session

        await create_checkout_session(user_id="user-1", tier="GROWTH", period="monthly")

    call_kwargs = mock_stripe.checkout.Session.create.call_args[1]
    assert call_kwargs["subscription_data"]["trial_period_days"] == 7


# ---------------------------------------------------------------------------
# Portal tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_portal_no_customer_raises():
    """Portal session should fail if user has no stripe_customer_id."""
    db, _ = _mock_db_with_user({**BASE_USER})

    with patch("app.services.billing.get_db", return_value=db), \
         pytest.raises(ValueError, match="No billing account"):
        await create_portal_session(user_id="user-1")


# ---------------------------------------------------------------------------
# Billing status tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_billing_status():
    """get_billing_status returns tier, status, usage, and limits."""
    user = {
        **BASE_USER,
        "subscription_tier": "GROWTH",
        "subscription_status": "active",
    }
    db, _ = _mock_db_with_user(user)

    with patch("app.services.billing.get_db", return_value=db):
        result = await get_billing_status("user-1")

    assert result["tier"] == "GROWTH"
    assert result["status"] == "active"
    assert result["usage"]["content_uploads"] == 0
    assert result["limits"]["uploads"] == 20
    assert result["limits"]["seats"] == 3


# ---------------------------------------------------------------------------
# Webhook tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_handle_checkout_completed():
    """checkout.session.completed links subscription to user."""
    db, doc_ref = _mock_db_with_user({**BASE_USER})

    fake_sub = MagicMock()
    fake_sub.metadata = {"pandocast_user_id": "user-1", "tier": "GROWTH"}
    fake_sub.get.side_effect = lambda k, default=None: {
        "id": "sub_123", "status": "active",
        "current_period_end": 1735689600,
    }.get(k, default)

    with patch("app.services.billing.get_db", return_value=db), \
         patch("app.services.billing.stripe") as mock_stripe:
        mock_stripe.Subscription.retrieve.return_value = fake_sub

        await handle_checkout_completed({
            "subscription": "sub_123",
            "customer": "cus_123",
        })

    doc_ref.update.assert_called()
    call_args = doc_ref.update.call_args[0][0]
    assert call_args["subscription_tier"] == "GROWTH"
    assert call_args["subscription_status"] == "active"


@pytest.mark.asyncio
async def test_handle_subscription_deleted_downgrades():
    """customer.subscription.deleted downgrades user to FREE and disables autopilot."""
    user = {**BASE_USER, "stripe_subscription_id": "sub_999", "subscription_tier": "GROWTH"}
    db, doc_ref = _mock_db_with_user(user)

    # Mock autopilot query (empty)
    autopilot_query = MagicMock()
    async def _empty_stream():
        return
        yield
    autopilot_query.stream = _empty_stream
    autopilot_query.where = MagicMock(return_value=autopilot_query)

    # Mock notifications collection
    notif_ref = AsyncMock()

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.document.return_value = doc_ref
        elif name == "autopilot_settings":
            coll.where.return_value = autopilot_query
        elif name == "notifications":
            coll.add = AsyncMock()
        return coll

    db.collection = _collection

    with patch("app.services.billing.get_db", return_value=db):
        await handle_subscription_deleted({
            "metadata": {"pandocast_user_id": "user-1"},
            "customer": "cus_123",
        })

    doc_ref.update.assert_called_once()
    call_args = doc_ref.update.call_args[0][0]
    assert call_args["subscription_tier"] == "FREE"
    assert call_args["subscription_status"] == "canceled"


@pytest.mark.asyncio
async def test_handle_invoice_payment_failed():
    """invoice.payment_failed sets status to past_due and creates notification."""
    user = {**BASE_USER, "stripe_customer_id": "cus_fail"}
    db = _mock_db_with_query_results(user)

    # Also need notifications collection
    original_collection = db.collection

    def _collection(name):
        if name == "notifications":
            coll = MagicMock()
            coll.add = AsyncMock()
            return coll
        return original_collection(name)

    db.collection = _collection

    with patch("app.services.billing.get_db", return_value=db):
        await handle_invoice_payment_failed({"customer": "cus_fail"})


@pytest.mark.asyncio
async def test_handle_invoice_paid_resets_usage():
    """invoice.paid resets usage counters."""
    user = {
        **BASE_USER,
        "stripe_customer_id": "cus_paid",
        "subscription_status": "past_due",
        "usage_this_period": {"content_uploads": 15, "generations_run": 10},
    }
    db, doc_ref = _mock_db_with_user(user)

    # _find_user_by_customer_id uses .where().limit().stream()
    found_doc = MagicMock()
    found_doc.id = "user-1"

    async def _found_stream():
        yield found_doc

    query = MagicMock()
    query.stream = _found_stream
    query.limit = MagicMock(return_value=query)

    def _collection(name):
        coll = MagicMock()
        if name == "users":
            coll.document.return_value = doc_ref
            coll.where.return_value = query
        return coll

    db.collection = _collection

    with patch("app.services.billing.get_db", return_value=db):
        await handle_invoice_paid({
            "customer": "cus_paid",
            "lines": {"data": [{"period": {"end": 1735689600}}]},
        })

    doc_ref.update.assert_called()
    call_args = doc_ref.update.call_args[0][0]
    assert call_args["usage_this_period"]["content_uploads"] == 0
    assert call_args["subscription_status"] == "active"


# ---------------------------------------------------------------------------
# Tier enforcement tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_check_tier_limit_blocks_free_user():
    """FREE tier user should be blocked from exceeding upload limit."""
    user = {
        **BASE_USER,
        "subscription_tier": "FREE",
        "usage_this_period": {"uploads": 3},
    }
    db, _ = _mock_db_with_user(user)

    with patch("app.services.billing.get_db", return_value=db):
        allowed = await check_tier_limit("user-1", "uploads")

    assert allowed is False


@pytest.mark.asyncio
async def test_check_tier_limit_allows_under_limit():
    """FREE tier user under limit should be allowed."""
    user = {
        **BASE_USER,
        "subscription_tier": "FREE",
        "usage_this_period": {"uploads": 1},
    }
    db, _ = _mock_db_with_user(user)

    with patch("app.services.billing.get_db", return_value=db):
        allowed = await check_tier_limit("user-1", "uploads")

    assert allowed is True


@pytest.mark.asyncio
async def test_pro_tier_unlimited():
    """PRO tier user should never be blocked (limit=-1 means unlimited)."""
    user = {
        **BASE_USER,
        "subscription_tier": "PRO",
        "usage_this_period": {"uploads": 9999},
    }
    db, _ = _mock_db_with_user(user)

    with patch("app.services.billing.get_db", return_value=db):
        allowed = await check_tier_limit("user-1", "uploads")

    assert allowed is True


@pytest.mark.asyncio
async def test_agency_tier_unlimited():
    """AGENCY tier user should never be blocked."""
    user = {
        **BASE_USER,
        "subscription_tier": "AGENCY",
        "usage_this_period": {"uploads": 9999},
    }
    db, _ = _mock_db_with_user(user)

    with patch("app.services.billing.get_db", return_value=db):
        allowed = await check_tier_limit("user-1", "uploads")

    assert allowed is True

    assert TIER_LIMITS["AGENCY"]["seats"] == -1


@pytest.mark.asyncio
async def test_check_and_increment_raises_at_limit():
    """check_and_increment should raise ValueError when at tier limit."""
    user = {
        **BASE_USER,
        "subscription_tier": "FREE",
        "usage_this_period": {"content_uploads": 3},
    }

    doc = _make_user_doc(user)
    doc_ref = MagicMock()
    doc_ref.get = AsyncMock(return_value=doc)

    collection = MagicMock()
    collection.document.return_value = doc_ref

    db = MagicMock()
    db.collection.return_value = collection
    db.transaction.return_value = MagicMock()

    from google.cloud import firestore as mock_fs

    with patch("app.services.billing.get_db", return_value=db), \
         patch("app.services.billing.fs") as mock_fs_mod:
        def passthrough_transactional(fn):
            async def wrapper(transaction):
                return await fn(transaction)
            return wrapper
        mock_fs_mod.async_transactional = passthrough_transactional

        with pytest.raises(ValueError, match="Tier limit reached"):
            await check_and_increment("user-1", "uploads", "content_uploads")


def test_tier_rank_ordering():
    """TIER_RANK should have correct ordering."""
    assert TIER_RANK["FREE"] < TIER_RANK["STARTER"]
    assert TIER_RANK["STARTER"] < TIER_RANK["GROWTH"]
    assert TIER_RANK["GROWTH"] < TIER_RANK["PRO"]
    assert TIER_RANK["PRO"] < TIER_RANK["AGENCY"]


def test_tier_limits_seats():
    """All tiers should have seats limit defined."""
    for tier in TIER_LIMITS:
        assert "seats" in TIER_LIMITS[tier]
