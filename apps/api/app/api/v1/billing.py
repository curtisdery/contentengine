import stripe
from fastapi import APIRouter, Request, HTTPException, Depends

from app.config import get_settings
from app.middleware.auth import get_current_user
from app.schemas.billing import CheckoutRequest, CheckoutResponse, PortalResponse, BillingStatusResponse
from app.services import billing as billing_service

settings = get_settings()
router = APIRouter(prefix="/billing", tags=["billing"])

stripe.api_key = settings.STRIPE_SECRET_KEY


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(body: CheckoutRequest, current_user=Depends(get_current_user)):
    """Create a Stripe Checkout session for subscribing to a tier."""
    if body.tier == "FREE":
        raise HTTPException(400, "Cannot checkout for FREE tier")
    try:
        result = await billing_service.create_checkout_session(
            user_id=current_user.id,
            tier=body.tier.value,
            period=body.period.value,
        )
        return CheckoutResponse(**result)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/portal", response_model=PortalResponse)
async def create_portal(current_user=Depends(get_current_user)):
    """Create a Stripe billing portal session for managing subscription."""
    try:
        result = await billing_service.create_portal_session(user_id=current_user.id)
        return PortalResponse(**result)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/status", response_model=BillingStatusResponse)
async def get_status(current_user=Depends(get_current_user)):
    """Get current subscription status, usage, and tier limits."""
    result = await billing_service.get_billing_status(user_id=current_user.id)
    return BillingStatusResponse(**result)


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Stripe webhook handler.
    No auth — Stripe signature verification only.
    Always returns 200 to Stripe (even on processing errors — log and move on).
    """
    payload = await request.body()
    sig = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(400, "Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")

    event_type = event["type"]
    data = event["data"]["object"]

    try:
        if event_type == "checkout.session.completed":
            await billing_service.handle_checkout_completed(data)

        elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
            await billing_service.handle_subscription_updated(data)

        elif event_type == "customer.subscription.deleted":
            await billing_service.handle_subscription_deleted(data)

        elif event_type == "invoice.payment_failed":
            await billing_service.handle_invoice_payment_failed(data)

        elif event_type == "invoice.paid":
            await billing_service.handle_invoice_paid(data)

    except Exception as e:
        # Log error but still return 200 to Stripe
        # Don't let processing failures cause Stripe to retry endlessly
        import logging
        logging.error(f"Webhook processing error for {event_type}: {e}", exc_info=True)

    return {"received": True}
