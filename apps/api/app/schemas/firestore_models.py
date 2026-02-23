from pydantic import BaseModel, Field
from datetime import datetime
from uuid import uuid4

class UserDoc(BaseModel):
    email: str
    display_name: str
    photo_url: str | None = None
    subscription_tier: str = "FREE"
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    subscription_status: str = "incomplete"
    current_period_end: datetime | None = None
    usage_this_period: dict = Field(default_factory=lambda: {
        "content_uploads": 0,
        "generations_run": 0,
        "outputs_generated": 0,
        "posts_published": 0,
    })
    mfa_enabled: bool = False
    timezone: str = "America/New_York"
    default_voice_profile_id: str | None = None
    notification_preferences: dict = Field(default_factory=lambda: {
        "email": True, "push": True,
    })
    fcm_tokens: list[dict] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: datetime | None = None
