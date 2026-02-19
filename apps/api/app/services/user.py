import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.auth import UserResponse
from app.schemas.user import UserUpdateRequest
from app.utils.exceptions import NotFoundError


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User:
    """Fetch a user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError(
            message="User not found",
            detail=f"No user found with id {user_id}",
        )
    return user


async def get_user_profile(db: AsyncSession, user_id: uuid.UUID) -> UserResponse:
    """Get the current user's profile."""
    user = await get_user_by_id(db, user_id)
    return UserResponse.model_validate(user)


async def update_user_profile(
    db: AsyncSession, user_id: uuid.UUID, update_data: UserUpdateRequest
) -> UserResponse:
    """Update the current user's profile fields."""
    user = await get_user_by_id(db, user_id)

    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(user, field, value)

    await db.flush()
    return UserResponse.model_validate(user)
