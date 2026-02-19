import uuid
from datetime import datetime

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.organization import Organization, OrganizationMember
from app.models.subscription import Subscription
from app.schemas.billing import (
    CreateCheckoutRequest,
    CheckoutResponse,
    PortalResponse,
    SubscriptionResponse,
)
from app.utils.exceptions import NotFoundError, ValidationError

settings = get_settings()
stripe.api_key = settings.STRIPE_SECRET_KEY

TIER_PRICE_MAP = {
    "growth": settings.STRIPE_PRICE_GROWTH,
    "pro": settings.STRIPE_PRICE_PRO,
}


async def _get_user_organization(
    db: AsyncSession, user_id: uuid.UUID
) -> Organization:
    """Get the organization owned by the user (first owned org)."""
    result = await db.execute(
        select(Organization).where(Organization.owner_id == user_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        raise NotFoundError(
            message="Organization not found",
            detail="No organization found for this user",
        )
    return org


async def _get_or_create_stripe_customer(
    db: AsyncSession, subscription: Subscription, email: str, name: str
) -> str:
    """Get existing Stripe customer ID or create a new one."""
    if subscription.stripe_customer_id:
        return subscription.stripe_customer_id

    customer = stripe.Customer.create(
        email=email,
        name=name,
        metadata={"organization_id": str(subscription.organization_id)},
    )
    subscription.stripe_customer_id = customer.id
    await db.flush()
    return customer.id


async def create_checkout_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    user_email: str,
    user_name: str,
    request: CreateCheckoutRequest,
) -> CheckoutResponse:
    """Create a Stripe checkout session for subscription upgrade."""
    org = await _get_user_organization(db, user_id)

    # Get or create subscription
    result = await db.execute(
        select(Subscription).where(Subscription.organization_id == org.id)
    )
    subscription = result.scalar_one_or_none()
    if not subscription:
        raise NotFoundError(
            message="Subscription not found",
            detail="No subscription found for this organization",
        )

    price_id = TIER_PRICE_MAP.get(request.tier)
    if not price_id:
        raise ValidationError(
            message="Invalid tier",
            detail=f"Tier '{request.tier}' is not available for checkout",
        )

    customer_id = await _get_or_create_stripe_customer(
        db, subscription, user_email, user_name
    )

    checkout_session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[
            {
                "price": price_id,
                "quantity": 1,
            }
        ],
        mode="subscription",
        success_url=request.success_url,
        cancel_url=request.cancel_url,
        metadata={
            "organization_id": str(org.id),
            "tier": request.tier,
        },
    )

    return CheckoutResponse(checkout_url=checkout_session.url)


async def handle_webhook(
    db: AsyncSession, payload: bytes, sig_header: str
) -> None:
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
        await _handle_checkout_completed(db, data)
    elif event_type == "customer.subscription.updated":
        await _handle_subscription_updated(db, data)
    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_deleted(db, data)
    elif event_type == "invoice.payment_failed":
        await _handle_payment_failed(db, data)


async def _handle_checkout_completed(db: AsyncSession, data: dict) -> None:
    """Handle successful checkout -- activate subscription."""
    customer_id = data.get("customer")
    subscription_id = data.get("subscription")
    metadata = data.get("metadata", {})
    tier = metadata.get("tier", "growth")

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == customer_id)
    )
    subscription = result.scalar_one_or_none()
    if subscription:
        subscription.stripe_subscription_id = subscription_id
        subscription.tier = tier
        subscription.status = "active"
        await db.flush()


async def _handle_subscription_updated(db: AsyncSession, data: dict) -> None:
    """Handle subscription updates from Stripe."""
    stripe_sub_id = data.get("id")
    status = data.get("status")

    result = await db.execute(
        select(Subscription).where(
            Subscription.stripe_subscription_id == stripe_sub_id
        )
    )
    subscription = result.scalar_one_or_none()
    if subscription:
        subscription.status = status
        subscription.cancel_at_period_end = data.get("cancel_at_period_end", False)

        current_period_start = data.get("current_period_start")
        current_period_end = data.get("current_period_end")
        if current_period_start:
            subscription.current_period_start = datetime.utcfromtimestamp(
                current_period_start
            )
        if current_period_end:
            subscription.current_period_end = datetime.utcfromtimestamp(
                current_period_end
            )
        await db.flush()


async def _handle_subscription_deleted(db: AsyncSession, data: dict) -> None:
    """Handle subscription cancellation."""
    stripe_sub_id = data.get("id")

    result = await db.execute(
        select(Subscription).where(
            Subscription.stripe_subscription_id == stripe_sub_id
        )
    )
    subscription = result.scalar_one_or_none()
    if subscription:
        subscription.status = "canceled"
        subscription.cancel_at_period_end = False
        await db.flush()


async def _handle_payment_failed(db: AsyncSession, data: dict) -> None:
    """Handle failed invoice payment."""
    customer_id = data.get("customer")

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == customer_id)
    )
    subscription = result.scalar_one_or_none()
    if subscription:
        subscription.status = "past_due"
        await db.flush()


async def get_subscription(
    db: AsyncSession, user_id: uuid.UUID
) -> SubscriptionResponse:
    """Get the current subscription for the user's organization."""
    org = await _get_user_organization(db, user_id)

    result = await db.execute(
        select(Subscription).where(Subscription.organization_id == org.id)
    )
    subscription = result.scalar_one_or_none()
    if not subscription:
        raise NotFoundError(
            message="Subscription not found",
            detail="No subscription found for this organization",
        )

    return SubscriptionResponse.model_validate(subscription)


async def create_portal_session(
    db: AsyncSession, user_id: uuid.UUID
) -> PortalResponse:
    """Create a Stripe billing portal session."""
    org = await _get_user_organization(db, user_id)

    result = await db.execute(
        select(Subscription).where(Subscription.organization_id == org.id)
    )
    subscription = result.scalar_one_or_none()
    if not subscription or not subscription.stripe_customer_id:
        raise ValidationError(
            message="No billing account",
            detail="No Stripe customer found. Please set up a subscription first.",
        )

    portal_session = stripe.billing_portal.Session.create(
        customer=subscription.stripe_customer_id,
        return_url=f"{settings.FRONTEND_URL}/settings/billing",
    )

    return PortalResponse(portal_url=portal_session.url)
