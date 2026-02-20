import re

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.organization import Organization, OrganizationMember, Workspace
from app.models.subscription import Subscription
from app.utils.exceptions import AuthenticationError
from app.utils.firebase import verify_firebase_token

bearer_scheme = HTTPBearer(auto_error=False)


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

    # Verify the Firebase ID token
    claims = verify_firebase_token(token)
    firebase_uid: str = claims["uid"]
    email: str | None = claims.get("email")
    display_name: str | None = claims.get("name")

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
            if not user.email_verified and claims.get("email_verified"):
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
            avatar_url=claims.get("picture"),
            email_verified=claims.get("email_verified", False),
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
