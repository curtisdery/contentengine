from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.auth import UserResponse
from app.schemas.user import UserUpdateRequest
from app.services import user as user_service

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Get the current authenticated user's profile."""
    return await user_service.get_user_profile(db=db, user_id=current_user.id)


@router.patch("/me", response_model=UserResponse)
async def update_current_user_profile(
    update_data: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update the current authenticated user's profile."""
    return await user_service.update_user_profile(
        db=db, user_id=current_user.id, update_data=update_data
    )
