import uuid
from datetime import datetime, date

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=12, description="Minimum 12 characters")
    full_name: str = Field(..., min_length=1, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class AuthTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    avatar_url: str | None = None
    date_of_birth: date | None = None
    email_verified: bool
    mfa_enabled: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# Rebuild model to resolve forward reference
AuthTokenResponse.model_rebuild()
