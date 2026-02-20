import base64
import json

import firebase_admin
from firebase_admin import auth, credentials

from app.config import get_settings
from app.utils.exceptions import AuthenticationError

_app = None


def _get_firebase_app() -> firebase_admin.App:
    """Lazily initialize the Firebase Admin SDK."""
    global _app
    if _app is not None:
        return _app

    settings = get_settings()
    decoded = base64.b64decode(settings.FIREBASE_SERVICE_ACCOUNT_BASE64)
    service_account_info = json.loads(decoded)

    cred = credentials.Certificate(service_account_info)
    _app = firebase_admin.initialize_app(
        cred,
        {"storageBucket": settings.FIREBASE_STORAGE_BUCKET},
    )
    return _app


def verify_firebase_token(id_token: str) -> dict:
    """Verify a Firebase ID token and return the decoded claims.

    Returns a dict with at least 'uid', 'email', and optionally 'name', 'picture'.
    Raises AuthenticationError on invalid/expired tokens.
    """
    _get_firebase_app()
    try:
        decoded = auth.verify_id_token(id_token)
        return decoded
    except (
        auth.InvalidIdTokenError,
        auth.ExpiredIdTokenError,
        auth.RevokedIdTokenError,
        auth.CertificateFetchError,
        ValueError,
    ):
        raise AuthenticationError(
            message="Invalid Firebase token",
            detail="The Firebase ID token is invalid or has expired",
        )
