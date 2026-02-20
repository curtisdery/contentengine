"""Fernet symmetric encryption for OAuth tokens."""

from cryptography.fernet import Fernet

from app.config import get_settings


def _get_fernet() -> Fernet:
    key = get_settings().TOKEN_ENCRYPTION_KEY
    if not key:
        raise ValueError(
            "TOKEN_ENCRYPTION_KEY is not configured. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_token(plaintext: str) -> str:
    """Encrypt a token string and return the ciphertext as a UTF-8 string."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a ciphertext string and return the original plaintext."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()
