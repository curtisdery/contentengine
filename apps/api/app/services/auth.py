import re
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.user import User, Session
from app.models.organization import Organization, OrganizationMember, Workspace
from app.models.subscription import Subscription
from app.schemas.auth import (
    SignupRequest,
    LoginRequest,
    RefreshTokenRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    AuthTokenResponse,
    UserResponse,
)
from app.utils.exceptions import AuthenticationError, ValidationError
from app.utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    hash_token,
    validate_password_strength,
    generate_verification_token,
)

settings = get_settings()


def _slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug


async def signup(
    db: AsyncSession,
    request: SignupRequest,
    ip_address: str | None = None,
    user_agent_str: str | None = None,
) -> AuthTokenResponse:
    """Register a new user, create org, workspace, subscription, and return tokens."""

    # Validate password strength
    if not validate_password_strength(request.password):
        raise ValidationError(
            message="Password too weak",
            detail="Password must be at least 12 characters long",
        )

    # Check if email already exists
    result = await db.execute(select(User).where(User.email == request.email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise ValidationError(
            message="Email already registered",
            detail="A user with this email address already exists",
        )

    # Create user
    user = User(
        email=request.email,
        password_hash=hash_password(request.password),
        full_name=request.full_name,
        email_verification_token=generate_verification_token(),
        email_verification_expires=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(user)
    await db.flush()

    # Create personal organization
    org_slug = _slugify(request.full_name) + "-" + str(user.id)[:8]
    organization = Organization(
        name=f"{request.full_name}'s Organization",
        slug=org_slug,
        owner_id=user.id,
    )
    db.add(organization)
    await db.flush()

    # Add user as owner of organization
    org_member = OrganizationMember(
        organization_id=organization.id,
        user_id=user.id,
        role="owner",
    )
    db.add(org_member)

    # Create default workspace
    workspace = Workspace(
        organization_id=organization.id,
        name="Default Workspace",
        slug="default",
    )
    db.add(workspace)

    # Create starter subscription (no Stripe customer yet for dev simplicity)
    subscription = Subscription(
        organization_id=organization.id,
        tier="starter",
        status="trialing",
    )
    db.add(subscription)
    await db.flush()

    # Create session and tokens
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token()

    session = Session(
        user_id=user.id,
        refresh_token_hash=hash_token(refresh_token),
        ip_address=ip_address,
        user_agent=user_agent_str,
        expires_at=datetime.utcnow()
        + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
        is_active=True,
    )
    db.add(session)

    return AuthTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


async def login(
    db: AsyncSession,
    request: LoginRequest,
    ip_address: str | None = None,
    user_agent_str: str | None = None,
) -> AuthTokenResponse:
    """Authenticate a user and return tokens."""

    # Find user by email
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if not user:
        raise AuthenticationError(
            message="Invalid credentials",
            detail="Email or password is incorrect",
        )

    # Check if account is locked
    if user.locked_until and user.locked_until > datetime.utcnow():
        remaining = (user.locked_until - datetime.utcnow()).seconds // 60
        raise AuthenticationError(
            message="Account locked",
            detail=f"Account is locked due to too many failed login attempts. Try again in {remaining + 1} minutes.",
        )

    # Check if user has a password (not OAuth-only user)
    if not user.password_hash:
        raise AuthenticationError(
            message="Invalid credentials",
            detail="This account uses OAuth login. Please sign in with your OAuth provider.",
        )

    # Verify password
    if not verify_password(request.password, user.password_hash):
        # Increment failed login attempts
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
            user.locked_until = datetime.utcnow() + timedelta(
                minutes=settings.LOCKOUT_DURATION_MINUTES
            )
        await db.flush()
        raise AuthenticationError(
            message="Invalid credentials",
            detail="Email or password is incorrect",
        )

    # Check if user is active
    if not user.is_active:
        raise AuthenticationError(
            message="Account disabled",
            detail="This account has been disabled. Please contact support.",
        )

    # Reset failed login attempts on successful login
    user.failed_login_attempts = 0
    user.locked_until = None

    # Create session and tokens
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token()

    session = Session(
        user_id=user.id,
        refresh_token_hash=hash_token(refresh_token),
        ip_address=ip_address,
        user_agent=user_agent_str,
        expires_at=datetime.utcnow()
        + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
        is_active=True,
    )
    db.add(session)

    return AuthTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


async def refresh_tokens(
    db: AsyncSession,
    request: RefreshTokenRequest,
    ip_address: str | None = None,
    user_agent_str: str | None = None,
) -> AuthTokenResponse:
    """Rotate refresh token and issue new access token."""

    token_hash = hash_token(request.refresh_token)

    # Find the active session with this refresh token
    result = await db.execute(
        select(Session).where(
            Session.refresh_token_hash == token_hash,
            Session.is_active == True,
            Session.expires_at > datetime.utcnow(),
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise AuthenticationError(
            message="Invalid refresh token",
            detail="The refresh token is invalid or has expired",
        )

    # Load user
    result = await db.execute(select(User).where(User.id == session.user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise AuthenticationError(
            message="User not found or inactive",
            detail="The user associated with this token is not available",
        )

    # Invalidate old session
    session.is_active = False

    # Create new session with rotated refresh token
    new_access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token()

    new_session = Session(
        user_id=user.id,
        refresh_token_hash=hash_token(new_refresh_token),
        ip_address=ip_address,
        user_agent=user_agent_str,
        expires_at=datetime.utcnow()
        + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
        is_active=True,
    )
    db.add(new_session)

    return AuthTokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        user=UserResponse.model_validate(user),
    )


async def logout(
    db: AsyncSession,
    user_id: uuid.UUID,
    access_token: str,
) -> None:
    """Invalidate all active sessions for the user's current token."""
    # Invalidate all active sessions for this user (simple approach)
    # A more targeted approach would track which session maps to which access token
    result = await db.execute(
        select(Session).where(
            Session.user_id == user_id,
            Session.is_active == True,
        )
    )
    sessions = result.scalars().all()
    for session in sessions:
        session.is_active = False


async def forgot_password(
    db: AsyncSession,
    request: ForgotPasswordRequest,
) -> None:
    """Generate a password reset token for the user.

    Always returns success to prevent email enumeration.
    """
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if not user:
        return  # Silent — don't reveal whether the email exists

    # Generate reset token valid for 1 hour
    user.password_reset_token = generate_verification_token()
    user.password_reset_expires = datetime.utcnow() + timedelta(hours=1)
    await db.flush()

    # In production, send email here. For now, log the token for dev/testing.
    import structlog

    logger = structlog.get_logger()
    logger.info(
        "password_reset_requested",
        email=user.email,
        reset_token=user.password_reset_token,
    )


async def reset_password(
    db: AsyncSession,
    request: ResetPasswordRequest,
) -> None:
    """Reset a user's password using a valid reset token."""
    result = await db.execute(
        select(User).where(
            User.password_reset_token == request.token,
            User.password_reset_expires > datetime.utcnow(),
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise ValidationError(
            message="Invalid or expired token",
            detail="This password reset link is invalid or has expired. Please request a new one.",
        )

    if not validate_password_strength(request.password):
        raise ValidationError(
            message="Password too weak",
            detail="Password must be at least 12 characters long",
        )

    # Update password and clear the reset token
    user.password_hash = hash_password(request.password)
    user.password_reset_token = None
    user.password_reset_expires = None

    # Invalidate all existing sessions (force re-login)
    sessions_result = await db.execute(
        select(Session).where(
            Session.user_id == user.id,
            Session.is_active == True,
        )
    )
    for session in sessions_result.scalars().all():
        session.is_active = False

    await db.flush()
