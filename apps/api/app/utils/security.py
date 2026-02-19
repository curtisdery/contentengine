import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: uuid.UUID) -> str:
    """Create a JWT access token."""
    expire = datetime.utcnow() + timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token() -> str:
    """Create a cryptographically secure refresh token."""
    return secrets.token_urlsafe(64)


def hash_token(token: str) -> str:
    """Hash a token using SHA-256 for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT access token. Raises JWTError on failure."""
    payload = jwt.decode(
        token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
    )
    if payload.get("type") != "access":
        raise JWTError("Invalid token type")
    return payload


def generate_verification_token() -> str:
    """Generate a token for email verification or password reset."""
    return secrets.token_urlsafe(32)


def validate_password_strength(password: str) -> bool:
    """Validate that a password meets minimum strength requirements.

    Requirements: minimum 12 characters.
    """
    return len(password) >= 12
