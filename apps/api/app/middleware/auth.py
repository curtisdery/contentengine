import re

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.models.organization import Organization, OrganizationMember, Workspace
from app.models.subscription import Subscription
from app.utils.exceptions import AuthenticationError
from app.utils.firebase import verify_firebase_token

bearer_scheme = HTTPBearer(auto_error=False)

# Dev mode constants
_DEV_TOKEN = "dev-token"
_DEV_EMAIL = "dev@pandocast.local"
_DEV_NAME = "Dev User"
_DEV_FIREBASE_UID = "dev-local-uid"


def _is_dev_mode() -> bool:
    """Check if running in development mode without Firebase configured."""
    settings = get_settings()
    return (
        settings.ENVIRONMENT == "development"
        and not settings.FIREBASE_SERVICE_ACCOUNT_BASE64
    )


def _slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency that verifies a Firebase ID token,
    looks up (or auto-provisions) the user, and returns the User object.
    """
    if credentials is None:
        raise AuthenticationError(
            message="Not authenticated",
            detail="Authorization header with Bearer token is required",
        )

    token = credentials.credentials

    # Dev mode bypass: accept dev-token when Firebase is not configured
    if _is_dev_mode() and token == _DEV_TOKEN:
        firebase_uid = _DEV_FIREBASE_UID
        email: str | None = _DEV_EMAIL
        display_name: str | None = _DEV_NAME
        avatar_url: str | None = None
        email_verified = True
    else:
        # Verify the Firebase ID token
        claims = verify_firebase_token(token)
        firebase_uid = claims["uid"]
        email = claims.get("email")
        display_name = claims.get("name")
        avatar_url = claims.get("picture")
        email_verified = claims.get("email_verified", False)

    # 1. Look up by firebase_uid
    result = await db.execute(
        select(User).where(User.firebase_uid == firebase_uid)
    )
    user = result.scalar_one_or_none()

    # 2. If not found, check by email (link existing user)
    if user is None and email:
        result = await db.execute(
            select(User).where(User.email == email)
        )
        user = result.scalar_one_or_none()
        if user is not None:
            # Link the existing user to their Firebase UID
            user.firebase_uid = firebase_uid
            if not user.email_verified and email_verified:
                user.email_verified = True
            await db.flush()

    # 3. If still not found, auto-provision new user
    if user is None:
        if not email:
            raise AuthenticationError(
                message="Email required",
                detail="Firebase account must have an email address",
            )

        full_name = display_name or email.split("@")[0]

        user = User(
            email=email,
            firebase_uid=firebase_uid,
            full_name=full_name,
            avatar_url=avatar_url,
            email_verified=email_verified,
        )
        db.add(user)
        await db.flush()

        # Create personal organization
        org_slug = _slugify(full_name) + "-" + str(user.id)[:8]
        organization = Organization(
            name=f"{full_name}'s Organization",
            slug=org_slug,
            owner_id=user.id,
        )
        db.add(organization)
        await db.flush()

        org_member = OrganizationMember(
            organization_id=organization.id,
            user_id=user.id,
            role="owner",
        )
        db.add(org_member)

        workspace = Workspace(
            organization_id=organization.id,
            name="Default Workspace",
            slug="default",
        )
        db.add(workspace)

        subscription = Subscription(
            organization_id=organization.id,
            tier="starter",
            status="trialing",
        )
        db.add(subscription)
        await db.flush()

    if not user.is_active:
        raise AuthenticationError(
            message="Account disabled",
            detail="This account has been disabled",
        )

    # Store user on request state for logging middleware
    request.state.user_id = str(user.id)

    return user
