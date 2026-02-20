import uuid
from datetime import datetime, date

from pydantic import BaseModel, Field


class FirebaseSignupRequest(BaseModel):
    firebase_token: str
    full_name: str = Field(..., min_length=1, max_length=255)


class FCMTokenRequest(BaseModel):
    fcm_token: str = Field(..., min_length=1, max_length=500)


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    firebase_uid: str | None = None
    avatar_url: str | None = None
    date_of_birth: date | None = None
    email_verified: bool
    mfa_enabled: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    message: str
