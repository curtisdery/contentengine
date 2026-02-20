from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.auth import (
    SignupRequest,
    LoginRequest,
    RefreshTokenRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    AuthTokenResponse,
    UserResponse,
    MessageResponse,
)
from app.services import auth as auth_service

router = APIRouter()


@router.post("/signup", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    request_body: SignupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthTokenResponse:
    """Register a new user account."""
    ip_address = request.client.host if request.client else None
    user_agent_str = request.headers.get("user-agent")

    return await auth_service.signup(
        db=db,
        request=request_body,
        ip_address=ip_address,
        user_agent_str=user_agent_str,
    )


@router.post("/login", response_model=AuthTokenResponse)
async def login(
    request_body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthTokenResponse:
    """Authenticate a user and return tokens."""
    ip_address = request.client.host if request.client else None
    user_agent_str = request.headers.get("user-agent")

    return await auth_service.login(
        db=db,
        request=request_body,
        ip_address=ip_address,
        user_agent_str=user_agent_str,
    )


@router.post("/refresh", response_model=AuthTokenResponse)
async def refresh(
    request_body: RefreshTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthTokenResponse:
    """Refresh tokens using a valid refresh token."""
    ip_address = request.client.host if request.client else None
    user_agent_str = request.headers.get("user-agent")

    return await auth_service.refresh_tokens(
        db=db,
        request=request_body,
        ip_address=ip_address,
        user_agent_str=user_agent_str,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the currently authenticated user."""
    return UserResponse.model_validate(current_user)


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    request_body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Request a password reset link."""
    await auth_service.forgot_password(db=db, request=request_body)
    # Always return success to prevent email enumeration
    return MessageResponse(
        message="If an account with that email exists, a password reset link has been sent."
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    request_body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Reset password using a valid reset token."""
    await auth_service.reset_password(db=db, request=request_body)
    return MessageResponse(message="Password has been reset successfully. You can now log in.")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Invalidate the current session."""
    # Extract the raw token from the Authorization header
    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "") if auth_header else ""

    await auth_service.logout(
        db=db,
        user_id=current_user.id,
        access_token=token,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
