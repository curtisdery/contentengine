from datetime import datetime

import stripe

from app.config import get_settings
from app.core.firestore import get_db
from app.utils.exceptions import NotFoundError, ValidationError

settings = get_settings()
stripe.api_key = settings.STRIPE_SECRET_KEY

TIER_LIMITS = {
    "FREE":    {"uploads": 3,  "formats": 5,  "platforms": 2,  "voice_profiles": 1},
    "STARTER": {"uploads": 10, "formats": 8,  "platforms": 3,  "voice_profiles": 1},
    "GROWTH":  {"uploads": 20, "formats": 18, "platforms": 5,  "voice_profiles": 3},
    "PRO":     {"uploads": -1, "formats": 18, "platforms": -1, "voice_profiles": -1},
    "AGENCY":  {"uploads": -1, "formats": 18, "platforms": -1, "voice_profiles": -1},
}


async def _get_user_doc(user_id: str):
    """Get user document from Firestore."""
    db = get_db()
    doc = await db.collection("users").document(user_id).get()
    if not doc.exists:
        raise NotFoundError(
            message="User not found",
            detail="No user found with this ID",
        )
    return doc


async def _get_or_create_stripe_customer(user_id: str, email: str) -> str:
    """Get existing Stripe customer ID or create a new one."""
    db = get_db()
    doc = await db.collection("users").document(user_id).get()
    data = doc.to_dict()

    if data.get("stripe_customer_id"):
        return data["stripe_customer_id"]

    customer = stripe.Customer.create(
        email=email,
        metadata={"user_id": user_id},
    )
    await db.collection("users").document(user_id).update({
        "stripe_customer_id": customer.id,
        "updated_at": datetime.utcnow(),
    })
    return customer.id


def get_tier_limits(tier: str) -> dict:
    """Get usage limits for a subscription tier."""
    return TIER_LIMITS.get(tier.upper(), TIER_LIMITS["FREE"])


async def check_usage_limit(user_id: str, limit_key: str) -> bool:
    """Check if user is within their tier's usage limit for a given key."""
    doc = await _get_user_doc(user_id)
    data = doc.to_dict()
    tier = data.get("subscription_tier", "FREE")
    limits = get_tier_limits(tier)
    max_allowed = limits.get(limit_key, 0)
    if max_allowed == -1:
        return True
    current_usage = data.get("usage_this_period", {}).get(limit_key, 0)
    return current_usage < max_allowed


async def increment_usage(user_id: str, limit_key: str) -> None:
    """Increment a usage counter for the current billing period."""
    db = get_db()
    from google.cloud.firestore_v1 import Increment
    await db.collection("users").document(user_id).update({
        f"usage_this_period.{limit_key}": Increment(1),
        "updated_at": datetime.utcnow(),
    })


async def create_checkout_session(
    user_id: str, user_email: str, tier: str, period: str = "monthly",
) -> dict:
    """Create a Stripe checkout session for subscription upgrade."""
    tier_upper = tier.upper()
    tier_prices = settings.STRIPE_PRICE_IDS.get(tier_upper)
    if not tier_prices:
        raise ValidationError(
            message="Invalid tier",
            detail=f"Tier '{tier}' is not available for checkout",
        )

    price_id = tier_prices.get(period)
    if not price_id:
        raise ValidationError(
            message="Invalid billing period",
            detail=f"Period '{period}' is not available for tier '{tier}'",
        )

    customer_id = await _get_or_create_stripe_customer(user_id, user_email)

    checkout_session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{settings.FRONTEND_URL}/settings?checkout=success",
        cancel_url=f"{settings.FRONTEND_URL}/settings?checkout=cancel",
        metadata={"user_id": user_id, "tier": tier_upper, "period": period},
    )

    return {"checkout_url": checkout_session.url, "session_id": checkout_session.id}


async def create_portal_session(user_id: str) -> dict:
    """Create a Stripe billing portal session."""
    doc = await _get_user_doc(user_id)
    data = doc.to_dict()

    if not data.get("stripe_customer_id"):
        raise ValidationError(
            message="No billing account",
            detail="No Stripe customer found. Please set up a subscription first.",
        )

    portal_session = stripe.billing_portal.Session.create(
        customer=data["stripe_customer_id"],
        return_url=f"{settings.FRONTEND_URL}/settings",
    )

    return {"portal_url": portal_session.url}


async def get_subscription(user_id: str) -> dict:
    """Get the current subscription status for a user."""
    doc = await _get_user_doc(user_id)
    data = doc.to_dict()

    tier = data.get("subscription_tier", "FREE")
    usage = data.get("usage_this_period", {})

    return {
        "tier": tier,
        "status": data.get("subscription_status", "active" if tier == "FREE" else "incomplete"),
        "usage": {
            "content_uploads": usage.get("content_uploads", 0),
            "generations_run": usage.get("generations_run", 0),
            "outputs_generated": usage.get("outputs_generated", 0),
            "posts_published": usage.get("posts_published", 0),
        },
        "limits": get_tier_limits(tier),
        "current_period_end": data.get("current_period_end"),
        "trial_ends_at": data.get("trial_ends_at"),
    }


async def handle_webhook(payload: bytes, sig_header: str) -> None:
    """Handle incoming Stripe webhook events."""
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise ValidationError(
            message="Invalid payload", detail="Webhook payload could not be parsed"
        )
    except stripe.error.SignatureVerificationError:
        raise ValidationError(
            message="Invalid signature",
            detail="Webhook signature verification failed",
        )

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(data)
    elif event_type == "customer.subscription.updated":
        await _handle_subscription_updated(data)
    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_deleted(data)
    elif event_type == "invoice.payment_failed":
        await _handle_payment_failed(data)


async def _handle_checkout_completed(data: dict) -> None:
    """Handle successful checkout — activate subscription."""
    db = get_db()
    subscription_id = data.get("subscription")
    metadata = data.get("metadata", {})
    tier = metadata.get("tier", "GROWTH").upper()
    period = metadata.get("period", "monthly")
    user_id = metadata.get("user_id")

    if user_id:
        await db.collection("users").document(user_id).update({
            "stripe_subscription_id": subscription_id,
            "subscription_tier": tier,
            "subscription_status": "active",
            "billing_period": period,
            "usage_this_period": {
                "content_uploads": 0,
                "generations_run": 0,
                "outputs_generated": 0,
                "posts_published": 0,
            },
            "updated_at": datetime.utcnow(),
        })


async def _handle_subscription_updated(data: dict) -> None:
    """Handle subscription updates from Stripe."""
    db = get_db()
    stripe_sub_id = data.get("id")
    sub_status = data.get("status")

    query = db.collection("users").where("stripe_subscription_id", "==", stripe_sub_id).limit(1)
    docs = [doc async for doc in query.stream()]
    if docs:
        updates = {
            "subscription_status": sub_status,
            "updated_at": datetime.utcnow(),
        }
        period_end = data.get("current_period_end")
        if period_end:
            updates["current_period_end"] = datetime.utcfromtimestamp(period_end)
        await docs[0].reference.update(updates)


async def _handle_subscription_deleted(data: dict) -> None:
    """Handle subscription cancellation."""
    db = get_db()
    stripe_sub_id = data.get("id")

    query = db.collection("users").where("stripe_subscription_id", "==", stripe_sub_id).limit(1)
    docs = [doc async for doc in query.stream()]
    if docs:
        await docs[0].reference.update({
            "subscription_status": "canceled",
            "subscription_tier": "FREE",
            "usage_this_period": {
                "content_uploads": 0,
                "generations_run": 0,
                "outputs_generated": 0,
                "posts_published": 0,
            },
            "updated_at": datetime.utcnow(),
        })


async def _handle_payment_failed(data: dict) -> None:
    """Handle failed invoice payment."""
    db = get_db()
    customer_id = data.get("customer")

    query = db.collection("users").where("stripe_customer_id", "==", customer_id).limit(1)
    docs = [doc async for doc in query.stream()]
    if docs:
        await docs[0].reference.update({
            "subscription_status": "past_due",
            "updated_at": datetime.utcnow(),
        })
