import uuid

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.utils.exceptions import AuthenticationError
from app.utils.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency that extracts and validates the JWT bearer token,
    loads the user from the database, and returns the User object.
    Raises 401 if the token is missing, invalid, or the user is not found/inactive.
    """
    if credentials is None:
        raise AuthenticationError(
            message="Not authenticated",
            detail="Authorization header with Bearer token is required",
        )

    token = credentials.credentials

    try:
        payload = decode_access_token(token)
    except JWTError:
        raise AuthenticationError(
            message="Invalid token",
            detail="The access token is invalid or has expired",
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise AuthenticationError(
            message="Invalid token",
            detail="Token payload is missing subject claim",
        )

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise AuthenticationError(
            message="Invalid token",
            detail="Token contains an invalid user identifier",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise AuthenticationError(
            message="User not found",
            detail="The user associated with this token no longer exists",
        )

    if not user.is_active:
        raise AuthenticationError(
            message="Account disabled",
            detail="This account has been disabled",
        )

    # Store user on request state for logging middleware
    request.state.user_id = str(user.id)

    return user
