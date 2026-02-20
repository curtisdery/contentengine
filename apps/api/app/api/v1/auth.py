from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.auth import (
    FirebaseSignupRequest,
    FCMTokenRequest,
    UserResponse,
    MessageResponse,
)
from app.services import auth as auth_service
from app.utils.firebase import verify_firebase_token

router = APIRouter()


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    request_body: FirebaseSignupRequest,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Register or sync a Firebase-authenticated user."""
    claims = verify_firebase_token(request_body.firebase_token)

    user = await auth_service.sync_firebase_user(
        db=db,
        firebase_uid=claims["uid"],
        email=claims.get("email", ""),
        full_name=request_body.full_name,
        avatar_url=claims.get("picture"),
        email_verified=claims.get("email_verified", False),
    )

    return UserResponse.model_validate(user)


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the currently authenticated user."""
    return UserResponse.model_validate(current_user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Clear FCM token on logout."""
    await auth_service.logout(db=db, user=current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/fcm-token", response_model=MessageResponse)
async def save_fcm_token(
    request_body: FCMTokenRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Save the user's FCM device token for push notifications."""
    await auth_service.save_fcm_token(
        db=db,
        user=current_user,
        fcm_token=request_body.fcm_token,
    )
    return MessageResponse(message="FCM token saved successfully")
