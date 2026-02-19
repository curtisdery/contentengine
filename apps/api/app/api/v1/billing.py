from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.billing import (
    CreateCheckoutRequest,
    CheckoutResponse,
    PortalResponse,
    SubscriptionResponse,
)
from app.services import billing as billing_service

router = APIRouter()


@router.post("/create-checkout", response_model=CheckoutResponse)
async def create_checkout(
    request_body: CreateCheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckoutResponse:
    """Create a Stripe checkout session for subscription upgrade."""
    return await billing_service.create_checkout_session(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        user_name=current_user.full_name,
        request=request_body,
    )


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    stripe_signature: str = Header(alias="stripe-signature"),
) -> dict:
    """Handle incoming Stripe webhook events."""
    payload = await request.body()
    await billing_service.handle_webhook(
        db=db, payload=payload, sig_header=stripe_signature
    )
    return {"status": "ok"}


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionResponse:
    """Get the current subscription details."""
    return await billing_service.get_subscription(db=db, user_id=current_user.id)


@router.post("/portal", response_model=PortalResponse)
async def create_portal(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PortalResponse:
    """Create a Stripe billing portal session."""
    return await billing_service.create_portal_session(db=db, user_id=current_user.id)
