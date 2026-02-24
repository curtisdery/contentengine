from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class SubscriptionTier(str, Enum):
    FREE = "FREE"
    STARTER = "STARTER"
    GROWTH = "GROWTH"
    PRO = "PRO"
    AGENCY = "AGENCY"


class BillingPeriod(str, Enum):
    MONTHLY = "monthly"
    ANNUAL = "annual"


# Firestore document shapes
class UsageThisPeriod(BaseModel):
    content_uploads: int = 0
    generations_run: int = 0
    outputs_generated: int = 0
    posts_published: int = 0


# Request/Response schemas
class CheckoutRequest(BaseModel):
    tier: SubscriptionTier
    period: BillingPeriod

class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str

class PortalResponse(BaseModel):
    portal_url: str

class BillingStatusResponse(BaseModel):
    tier: SubscriptionTier
    status: str
    usage: UsageThisPeriod
    limits: dict
    current_period_end: datetime | None = None
    trial_ends_at: datetime | None = None
