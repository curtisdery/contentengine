import stripe
from datetime import datetime
from google.cloud import firestore as fs

from app.config import get_settings
from app.core.firestore import get_db
from app.schemas.billing import SubscriptionTier, UsageThisPeriod

settings = get_settings()
stripe.api_key = settings.STRIPE_SECRET_KEY

# ━━━ TIER LIMITS ━━━
TIER_LIMITS = {
    "FREE":    {"uploads": 3,  "formats": 5,  "platforms": 2,  "voice_profiles": 1, "seats": 1},
    "STARTER": {"uploads": 10, "formats": 8,  "platforms": 3,  "voice_profiles": 1, "seats": 1},
    "GROWTH":  {"uploads": 20, "formats": 18, "platforms": 5,  "voice_profiles": 3, "seats": 3},
    "PRO":     {"uploads": -1, "formats": 18, "platforms": -1, "voice_profiles": -1, "seats": 10},
    "AGENCY":  {"uploads": -1, "formats": 18, "platforms": -1, "voice_profiles": -1, "seats": -1},
}

TIER_RANK = {"FREE": 0, "STARTER": 1, "GROWTH": 2, "PRO": 3, "AGENCY": 4}


async def get_or_create_stripe_customer(user_id: str) -> str:
    """Get existing Stripe customer ID or create a new one."""
    db = get_db()
    user_ref = db.collection("users").document(user_id)
    user_doc = await user_ref.get()
    user_data = user_doc.to_dict()

    if user_data.get("stripe_customer_id"):
        return user_data["stripe_customer_id"]

    # Create new Stripe customer
    customer = stripe.Customer.create(
        email=user_data.get("email"),
        name=user_data.get("display_name"),
        metadata={"pandocast_user_id": user_id},
    )

    # Store on user doc
    await user_ref.update({
        "stripe_customer_id": customer.id,
        "updated_at": datetime.utcnow(),
    })

    return customer.id


async def create_checkout_session(user_id: str, tier: str, period: str) -> dict:
    """Create a Stripe Checkout session for subscription."""
    price_id = settings.STRIPE_PRICE_IDS.get(tier, {}).get(period)
    if not price_id:
        raise ValueError(f"No price configured for {tier}/{period}")

    customer_id = await get_or_create_stripe_customer(user_id)

    session_params = {
        "customer": customer_id,
        "payment_method_types": ["card"],
        "mode": "subscription",
        "allow_promotion_codes": True,
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": f"{settings.FRONTEND_URL}/settings/billing?success=true&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{settings.FRONTEND_URL}/settings/billing?canceled=true",
        "subscription_data": {
            "metadata": {
                "pandocast_user_id": user_id,
                "tier": tier,
            },
        },
    }

    # 7-day trial for GROWTH tier
    if tier == "GROWTH":
        session_params["subscription_data"]["trial_period_days"] = 7

    session = stripe.checkout.Session.create(**session_params)
    return {"checkout_url": session.url, "session_id": session.id}


async def create_portal_session(user_id: str) -> dict:
    """Create Stripe billing portal session for managing subscription."""
    db = get_db()
    user_doc = await db.collection("users").document(user_id).get()
    customer_id = user_doc.to_dict().get("stripe_customer_id")

    if not customer_id:
        raise ValueError("No billing account found. Subscribe to a plan first.")

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{settings.FRONTEND_URL}/settings/billing",
    )
    return {"portal_url": session.url}


async def get_billing_status(user_id: str) -> dict:
    """Get current subscription status, usage, and limits."""
    db = get_db()
    user_doc = await db.collection("users").document(user_id).get()
    data = user_doc.to_dict()

    tier = data.get("subscription_tier", "FREE")
    usage_raw = data.get("usage_this_period", {})
    usage = UsageThisPeriod(**usage_raw)

    return {
        "tier": tier,
        "status": data.get("subscription_status", "incomplete"),
        "usage": usage.model_dump(),
        "limits": TIER_LIMITS.get(tier, TIER_LIMITS["FREE"]),
        "current_period_end": data.get("current_period_end"),
        "trial_ends_at": data.get("trial_ends_at"),
    }


# ━━━ WEBHOOK HANDLERS ━━━

async def handle_checkout_completed(session: dict):
    """Handle checkout.session.completed — link subscription to user."""
    subscription_id = session.get("subscription")
    if not subscription_id:
        return

    # Fetch full subscription to get metadata
    subscription = stripe.Subscription.retrieve(subscription_id)
    user_id = subscription.metadata.get("pandocast_user_id")
    tier = subscription.metadata.get("tier", "STARTER")

    if not user_id:
        # Fallback: look up by customer ID
        customer_id = session.get("customer")
        user_id = await _find_user_by_customer_id(customer_id)
        if not user_id:
            raise ValueError(f"Cannot find user for customer {customer_id}")

    await _update_user_subscription(user_id, subscription, tier)


async def handle_subscription_updated(subscription: dict):
    """Handle customer.subscription.created and customer.subscription.updated."""
    user_id = subscription.get("metadata", {}).get("pandocast_user_id")
    tier = subscription.get("metadata", {}).get("tier", "STARTER")

    if not user_id:
        customer_id = subscription.get("customer")
        user_id = await _find_user_by_customer_id(customer_id)
        if not user_id:
            return

    await _update_user_subscription(user_id, subscription, tier)


async def handle_subscription_deleted(subscription: dict):
    """Handle customer.subscription.deleted — downgrade to FREE."""
    user_id = subscription.get("metadata", {}).get("pandocast_user_id")

    if not user_id:
        customer_id = subscription.get("customer")
        user_id = await _find_user_by_customer_id(customer_id)
        if not user_id:
            return

    db = get_db()

    # Downgrade user
    await db.collection("users").document(user_id).update({
        "subscription_tier": "FREE",
        "subscription_status": "canceled",
        "stripe_subscription_id": None,
        "current_period_end": None,
        "updated_at": datetime.utcnow(),
    })

    # Disable all autopilot settings
    autopilot_docs = db.collection("autopilot_settings").where("user_id", "==", user_id).where("is_enabled", "==", True)
    async for doc in autopilot_docs.stream():
        await doc.reference.update({"is_enabled": False, "disabled_at": datetime.utcnow()})

    # Write notification
    await db.collection("notifications").add({
        "user_id": user_id,
        "type": "billing_warning",
        "title": "Subscription Canceled",
        "body": "Your subscription has been canceled. You've been moved to the Free tier.",
        "action_url": "/settings/billing",
        "read": False,
        "created_at": datetime.utcnow(),
    })


async def handle_invoice_payment_failed(invoice: dict):
    """Handle invoice.payment_failed — set past_due, notify user."""
    customer_id = invoice.get("customer")
    user_id = await _find_user_by_customer_id(customer_id)
    if not user_id:
        return

    db = get_db()
    await db.collection("users").document(user_id).update({
        "subscription_status": "past_due",
        "updated_at": datetime.utcnow(),
    })

    await db.collection("notifications").add({
        "user_id": user_id,
        "type": "billing_failed",
        "title": "Payment Failed",
        "body": "We couldn't process your payment. Please update your billing information to avoid service interruption.",
        "action_url": "/settings/billing",
        "read": False,
        "created_at": datetime.utcnow(),
    })


async def handle_invoice_paid(invoice: dict):
    """Handle invoice.paid — reset usage counter, update period."""
    customer_id = invoice.get("customer")
    user_id = await _find_user_by_customer_id(customer_id)
    if not user_id:
        return

    db = get_db()
    update_data = {
        "usage_this_period": {
            "content_uploads": 0,
            "generations_run": 0,
            "outputs_generated": 0,
            "posts_published": 0,
        },
        "updated_at": datetime.utcnow(),
    }

    # If subscription was past_due, it's now active again
    user_doc = await db.collection("users").document(user_id).get()
    if user_doc.to_dict().get("subscription_status") == "past_due":
        update_data["subscription_status"] = "active"

    # Update period end from invoice
    period_end = invoice.get("lines", {}).get("data", [{}])[0].get("period", {}).get("end")
    if period_end:
        update_data["current_period_end"] = datetime.utcfromtimestamp(period_end)

    await db.collection("users").document(user_id).update(update_data)


# ━━━ INTERNAL HELPERS ━━━

async def _find_user_by_customer_id(customer_id: str) -> str | None:
    """Look up Pandocast user ID by Stripe customer ID."""
    db = get_db()
    query = db.collection("users").where("stripe_customer_id", "==", customer_id).limit(1)
    async for doc in query.stream():
        return doc.id
    return None


async def _update_user_subscription(user_id: str, subscription: dict, tier: str):
    """Update user doc with subscription data."""
    db = get_db()

    status = subscription.get("status", "active")
    current_period_end = subscription.get("current_period_end")
    trial_end = subscription.get("trial_end")

    update_data = {
        "stripe_subscription_id": subscription.get("id"),
        "subscription_tier": tier,
        "subscription_status": status,
        "updated_at": datetime.utcnow(),
    }

    if current_period_end:
        update_data["current_period_end"] = datetime.utcfromtimestamp(current_period_end)
    if trial_end:
        update_data["trial_ends_at"] = datetime.utcfromtimestamp(trial_end)

    await db.collection("users").document(user_id).update(update_data)


# ━━━ TIER ENFORCEMENT ━━━

async def check_tier_limit(user_id: str, limit_key: str) -> bool:
    """Check if user is within their tier limit for a given resource. Returns True if allowed."""
    db = get_db()
    user_doc = await db.collection("users").document(user_id).get()
    data = user_doc.to_dict()

    tier = data.get("subscription_tier", "FREE")
    limits = TIER_LIMITS.get(tier, TIER_LIMITS["FREE"])
    limit = limits.get(limit_key, 0)

    if limit == -1:
        return True  # Unlimited

    usage = data.get("usage_this_period", {})
    current = usage.get(f"{limit_key}", 0)
    # Also check alternate key formats
    if current == 0:
        alt_keys = {
            "uploads": "content_uploads",
            "content_uploads": "uploads",
        }
        alt = alt_keys.get(limit_key)
        if alt:
            current = usage.get(alt, 0)

    return current < limit


async def increment_usage(user_id: str, usage_key: str):
    """Atomically increment a usage counter on the user doc."""
    db = get_db()
    await db.collection("users").document(user_id).update({
        f"usage_this_period.{usage_key}": fs.Increment(1),
        "updated_at": datetime.utcnow(),
    })


async def check_and_increment(user_id: str, limit_key: str, usage_key: str):
    """
    Check tier limit and increment usage in a single transaction.
    Raises ValueError if limit exceeded.
    """
    db = get_db()
    user_ref = db.collection("users").document(user_id)

    @fs.async_transactional
    async def txn(transaction):
        user_doc = await user_ref.get(transaction=transaction)
        data = user_doc.to_dict()

        tier = data.get("subscription_tier", "FREE")
        limits = TIER_LIMITS.get(tier, TIER_LIMITS["FREE"])
        limit = limits.get(limit_key, 0)

        usage = data.get("usage_this_period", {})
        current = usage.get(usage_key, 0)

        if limit != -1 and current >= limit:
            raise ValueError(
                f"Tier limit reached: {current}/{limit} {limit_key}. "
                f"Upgrade to unlock more at /settings/billing"
            )

        transaction.update(user_ref, {
            f"usage_this_period.{usage_key}": current + 1,
            "updated_at": datetime.utcnow(),
        })

    transaction = db.transaction()
    await txn(transaction)
