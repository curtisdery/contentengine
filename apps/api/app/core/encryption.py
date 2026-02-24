import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import get_settings

_KEY: bytes | None = None


def _get_key() -> bytes:
    global _KEY
    if _KEY is None:
        settings = get_settings()
        raw = settings.TOKEN_ENCRYPTION_KEY
        _KEY = base64.b64decode(raw) if len(raw) != 32 else raw.encode()
    return _KEY


def encrypt(plaintext: str) -> str:
    """Encrypt plaintext with AES-256-GCM. Returns base64(nonce + ciphertext)."""
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()


def decrypt(token: str) -> str:
    """Decrypt a base64(nonce + ciphertext) token back to plaintext."""
    key = _get_key()
    raw = base64.b64decode(token)
    nonce, ciphertext = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode()
