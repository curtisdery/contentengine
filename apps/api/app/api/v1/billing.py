from fastapi import APIRouter, Depends, Header, Request, status

from app.middleware.auth import get_current_user
from app.schemas.billing import (
    BillingStatusResponse,
    CheckoutRequest,
    CheckoutResponse,
    PortalResponse,
)
from app.services import billing as billing_service

router = APIRouter()


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    current_user=Depends(get_current_user),
) -> dict:
    """Create a Stripe checkout session for subscription upgrade."""
    return await billing_service.create_checkout_session(
        user_id=current_user.id,
        user_email=current_user.email,
        tier=body.tier.value,
        period=body.period.value,
    )


@router.post("/portal", response_model=PortalResponse)
async def create_portal(
    current_user=Depends(get_current_user),
) -> dict:
    """Create a Stripe billing portal session."""
    return await billing_service.create_portal_session(user_id=current_user.id)


@router.get("/status", response_model=BillingStatusResponse)
async def get_status(
    current_user=Depends(get_current_user),
) -> dict:
    """Get the current subscription status, usage, and limits."""
    return await billing_service.get_subscription(user_id=current_user.id)


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(alias="stripe-signature"),
) -> dict:
    """Handle incoming Stripe webhook events (no auth, signature verification only)."""
    payload = await request.body()
    await billing_service.handle_webhook(payload=payload, sig_header=stripe_signature)
    return {"status": "ok"}
