import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.organization import Organization, OrganizationMember, Workspace
from app.models.subscription import Subscription
from app.schemas.auth import UserResponse
from app.utils.exceptions import ValidationError
from app.utils.firebase import verify_firebase_token


def _slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug


async def sync_firebase_user(
    db: AsyncSession,
    firebase_uid: str,
    email: str,
    full_name: str,
    avatar_url: str | None = None,
    email_verified: bool = False,
) -> User:
    """Find or create a user from Firebase auth data.

    - If a user with this firebase_uid exists, update and return them.
    - If a user with this email exists, link them to the firebase_uid.
    - Otherwise, create a new user with org + workspace + subscription.
    """
    # Check by firebase_uid first
    result = await db.execute(
        select(User).where(User.firebase_uid == firebase_uid)
    )
    user = result.scalar_one_or_none()

    if user is not None:
        # Update fields if changed
        if user.full_name != full_name:
            user.full_name = full_name
        if avatar_url and user.avatar_url != avatar_url:
            user.avatar_url = avatar_url
        if email_verified and not user.email_verified:
            user.email_verified = True
        await db.flush()
        return user

    # Check by email
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is not None:
        user.firebase_uid = firebase_uid
        if user.full_name != full_name:
            user.full_name = full_name
        if avatar_url and user.avatar_url != avatar_url:
            user.avatar_url = avatar_url
        if email_verified and not user.email_verified:
            user.email_verified = True
        await db.flush()
        return user

    # Create new user
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

    return user


async def logout(db: AsyncSession, user: User) -> None:
    """Clear the user's FCM token on logout."""
    if user.fcm_token:
        user.fcm_token = None
        await db.flush()


async def save_fcm_token(db: AsyncSession, user: User, fcm_token: str) -> None:
    """Save or update the user's FCM device token."""
    user.fcm_token = fcm_token
    await db.flush()
