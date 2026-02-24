import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta

from app.services.billing import (
    create_checkout_session,
    handle_checkout_completed,
    handle_subscription_updated,
    handle_subscription_deleted,
    handle_invoice_payment_failed,
    handle_invoice_paid,
    check_tier_limit,
    check_and_increment,
    TIER_LIMITS,
)


# ━━━ FIXTURES ━━━

@pytest.fixture
def mock_db():
    """Mock Firestore client."""
    with patch("app.services.billing.get_db") as mock:
        db = AsyncMock()
        mock.return_value = db
        yield db


@pytest.fixture
def mock_stripe():
    """Mock Stripe API."""
    with patch("app.services.billing.stripe") as mock:
        yield mock


def make_user_doc(overrides=None):
    """Create a mock user document."""
    base = {
        "email": "creator@example.com",
        "display_name": "Test Creator",
        "stripe_customer_id": "cus_test123",
        "stripe_subscription_id": None,
        "subscription_tier": "FREE",
        "subscription_status": "incomplete",
        "usage_this_period": {
            "content_uploads": 0,
            "generations_run": 0,
            "outputs_generated": 0,
            "posts_published": 0,
        },
        "current_period_end": None,
    }
    if overrides:
        base.update(overrides)
    return base


# ━━━ CHECKOUT TESTS ━━━

@pytest.mark.asyncio
async def test_checkout_creates_stripe_customer_when_missing(mock_db, mock_stripe):
    """First checkout should create a Stripe customer and save ID to Firestore."""
    user_doc = make_user_doc({"stripe_customer_id": None})
    mock_doc = AsyncMock()
    mock_doc.to_dict.return_value = user_doc
    mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=mock_doc)
    mock_db.collection.return_value.document.return_value.update = AsyncMock()

    mock_stripe.Customer.create.return_value = MagicMock(id="cus_new123")
    mock_stripe.checkout.Session.create.return_value = MagicMock(
        url="https://checkout.stripe.com/test", id="cs_test"
    )

    result = await create_checkout_session("user123", "STARTER", "monthly")

    mock_stripe.Customer.create.assert_called_once()
    assert result["checkout_url"] == "https://checkout.stripe.com/test"


@pytest.mark.asyncio
async def test_checkout_reuses_existing_customer(mock_db, mock_stripe):
    """If user already has stripe_customer_id, reuse it."""
    user_doc = make_user_doc({"stripe_customer_id": "cus_existing"})
    mock_doc = AsyncMock()
    mock_doc.to_dict.return_value = user_doc
    mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=mock_doc)

    mock_stripe.checkout.Session.create.return_value = MagicMock(
        url="https://checkout.stripe.com/test", id="cs_test"
    )

    await create_checkout_session("user123", "GROWTH", "annual")

    mock_stripe.Customer.create.assert_not_called()
    call_kwargs = mock_stripe.checkout.Session.create.call_args[1]
    assert call_kwargs["customer"] == "cus_existing"


@pytest.mark.asyncio
async def test_checkout_adds_trial_for_growth(mock_db, mock_stripe):
    """GROWTH tier should get a 7-day trial."""
    user_doc = make_user_doc()
    mock_doc = AsyncMock()
    mock_doc.to_dict.return_value = user_doc
    mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=mock_doc)

    mock_stripe.checkout.Session.create.return_value = MagicMock(url="url", id="id")

    await create_checkout_session("user123", "GROWTH", "monthly")

    call_kwargs = mock_stripe.checkout.Session.create.call_args[1]
    assert call_kwargs["subscription_data"]["trial_period_days"] == 7


@pytest.mark.asyncio
async def test_checkout_no_trial_for_starter(mock_db, mock_stripe):
    """STARTER tier should NOT get a trial."""
    user_doc = make_user_doc()
    mock_doc = AsyncMock()
    mock_doc.to_dict.return_value = user_doc
    mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=mock_doc)

    mock_stripe.checkout.Session.create.return_value = MagicMock(url="url", id="id")

    await create_checkout_session("user123", "STARTER", "monthly")

    call_kwargs = mock_stripe.checkout.Session.create.call_args[1]
    assert "trial_period_days" not in call_kwargs.get("subscription_data", {})


# ━━━ WEBHOOK TESTS ━━━

@pytest.mark.asyncio
async def test_webhook_subscription_updated_writes_firestore(mock_db):
    """Subscription update should write tier, status, and period end to user doc."""
    mock_db.collection.return_value.document.return_value.update = AsyncMock()

    subscription = {
        "id": "sub_test123",
        "status": "active",
        "current_period_end": int((datetime.utcnow() + timedelta(days=30)).timestamp()),
        "trial_end": None,
        "metadata": {"pandocast_user_id": "user123", "tier": "GROWTH"},
        "customer": "cus_test",
    }

    await handle_subscription_updated(subscription)

    mock_db.collection.return_value.document.return_value.update.assert_called_once()
    call_args = mock_db.collection.return_value.document.return_value.update.call_args[0][0]
    assert call_args["subscription_tier"] == "GROWTH"
    assert call_args["subscription_status"] == "active"


@pytest.mark.asyncio
async def test_webhook_subscription_deleted_downgrades(mock_db):
    """Subscription deletion should downgrade to FREE and disable autopilot."""
    mock_db.collection.return_value.document.return_value.update = AsyncMock()

    # Mock autopilot query (empty — no autopilot to disable)
    mock_stream = AsyncMock()
    mock_stream.__aiter__ = AsyncMock(return_value=iter([]))
    mock_db.collection.return_value.where.return_value.where.return_value.stream.return_value = mock_stream

    # Mock notification add
    mock_db.collection.return_value.add = AsyncMock()

    subscription = {
        "metadata": {"pandocast_user_id": "user123"},
        "customer": "cus_test",
    }

    await handle_subscription_deleted(subscription)

    update_call = mock_db.collection.return_value.document.return_value.update.call_args[0][0]
    assert update_call["subscription_tier"] == "FREE"
    assert update_call["subscription_status"] == "canceled"


@pytest.mark.asyncio
async def test_webhook_payment_failed_sets_past_due(mock_db):
    """Payment failure should set status to past_due and send notification."""
    # Mock user lookup by customer ID
    mock_doc = AsyncMock()
    mock_doc.id = "user123"
    mock_stream = AsyncMock()
    mock_stream.__aiter__ = AsyncMock(return_value=iter([mock_doc]))
    mock_db.collection.return_value.where.return_value.limit.return_value.stream.return_value = mock_stream

    mock_db.collection.return_value.document.return_value.update = AsyncMock()
    mock_db.collection.return_value.add = AsyncMock()

    await handle_invoice_payment_failed({"customer": "cus_test"})

    update_call = mock_db.collection.return_value.document.return_value.update.call_args[0][0]
    assert update_call["subscription_status"] == "past_due"


@pytest.mark.asyncio
async def test_webhook_invoice_paid_resets_usage(mock_db):
    """Paid invoice should reset usage counters to zero."""
    # Mock user lookup
    mock_user_query_doc = AsyncMock()
    mock_user_query_doc.id = "user123"
    mock_stream = AsyncMock()
    mock_stream.__aiter__ = AsyncMock(return_value=iter([mock_user_query_doc]))
    mock_db.collection.return_value.where.return_value.limit.return_value.stream.return_value = mock_stream

    # Mock user doc for status check
    mock_user_doc = AsyncMock()
    mock_user_doc.to_dict.return_value = {"subscription_status": "active"}
    mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=mock_user_doc)
    mock_db.collection.return_value.document.return_value.update = AsyncMock()

    await handle_invoice_paid({
        "customer": "cus_test",
        "lines": {"data": [{"period": {"end": int(datetime.utcnow().timestamp())}}]},
    })

    update_call = mock_db.collection.return_value.document.return_value.update.call_args[0][0]
    assert update_call["usage_this_period"]["content_uploads"] == 0
    assert update_call["usage_this_period"]["generations_run"] == 0


# ━━━ TIER ENFORCEMENT TESTS ━━━

@pytest.mark.asyncio
async def test_tier_limit_blocks_free_at_3_uploads(mock_db):
    """FREE tier should be blocked at 3 uploads."""
    user_doc = make_user_doc({"usage_this_period": {"content_uploads": 3}})
    mock_doc = AsyncMock()
    mock_doc.to_dict.return_value = user_doc
    mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=mock_doc)

    result = await check_tier_limit("user123", "uploads")
    assert result is False


@pytest.mark.asyncio
async def test_tier_limit_allows_free_under_limit(mock_db):
    """FREE tier should be allowed under 3 uploads."""
    user_doc = make_user_doc({"usage_this_period": {"content_uploads": 1}})
    mock_doc = AsyncMock()
    mock_doc.to_dict.return_value = user_doc
    mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=mock_doc)

    result = await check_tier_limit("user123", "uploads")
    assert result is True


@pytest.mark.asyncio
async def test_pro_tier_unlimited(mock_db):
    """PRO tier should have unlimited uploads."""
    user_doc = make_user_doc({
        "subscription_tier": "PRO",
        "usage_this_period": {"content_uploads": 999},
    })
    mock_doc = AsyncMock()
    mock_doc.to_dict.return_value = user_doc
    mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=mock_doc)

    result = await check_tier_limit("user123", "uploads")
    assert result is True
