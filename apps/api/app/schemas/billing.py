import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, HttpUrl


class CreateCheckoutRequest(BaseModel):
    tier: Literal["growth", "pro"]
    success_url: str
    cancel_url: str


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str


class SubscriptionResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    tier: str
    status: str
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
