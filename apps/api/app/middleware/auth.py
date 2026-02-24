import re
from datetime import datetime, timezone

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.core.firestore import get_db
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


class _UserProxy:
    """Lightweight user object returned by get_current_user."""

    def __init__(self, data: dict, doc_id: str):
        self._data = data
        self.id = doc_id
        self.email = data.get("email", "")
        self.full_name = data.get("full_name", "")
        self.firebase_uid = data.get("firebase_uid", "")
        self.avatar_url = data.get("avatar_url")
        self.email_verified = data.get("email_verified", False)
        self.is_active = data.get("is_active", True)
        self.tier = data.get("tier", "starter")
        self.fcm_token = data.get("fcm_token")
        self.created_at = data.get("created_at")

    def to_dict(self) -> dict:
        return {**self._data, "id": self.id}


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> _UserProxy:
    """FastAPI dependency that verifies a Firebase ID token,
    looks up (or auto-provisions) the user, and returns a user proxy.
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

    db = get_db()
    now = datetime.now(timezone.utc)

    # 1. Look up by firebase_uid
    query = db.collection("users").where("firebase_uid", "==", firebase_uid).limit(1)
    user_doc = None
    async for doc in query.stream():
        user_doc = doc
        break

    # 2. If not found, check by email (link existing user)
    if user_doc is None and email:
        query = db.collection("users").where("email", "==", email).limit(1)
        async for doc in query.stream():
            user_doc = doc
            break
        if user_doc is not None:
            update_data = {"firebase_uid": firebase_uid}
            user_data = user_doc.to_dict()
            if not user_data.get("email_verified") and email_verified:
                update_data["email_verified"] = True
            await db.collection("users").document(user_doc.id).update(update_data)

    # 3. If still not found, auto-provision new user
    if user_doc is None:
        if not email:
            raise AuthenticationError(
                message="Email required",
                detail="Firebase account must have an email address",
            )

        full_name = display_name or email.split("@")[0]

        user_ref = db.collection("users").document()
        user_data = {
            "email": email,
            "firebase_uid": firebase_uid,
            "full_name": full_name,
            "avatar_url": avatar_url,
            "email_verified": email_verified,
            "is_active": True,
            "tier": "starter",
            "created_at": now,
            "updated_at": now,
        }
        await user_ref.set(user_data)

        user = _UserProxy(user_data, user_ref.id)
        request.state.user_id = user.id
        return user

    data = user_doc.to_dict()
    if not data.get("is_active", True):
        raise AuthenticationError(
            message="Account disabled",
            detail="This account has been disabled",
        )

    user = _UserProxy(data, user_doc.id)
    request.state.user_id = user.id
    return user
