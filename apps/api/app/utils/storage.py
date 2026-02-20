import uuid
from datetime import timedelta

from firebase_admin import storage

from app.utils.firebase import _get_firebase_app


def generate_upload_url(
    file_name: str,
    content_type: str,
    folder: str = "uploads",
) -> tuple[str, str]:
    """Generate a signed upload URL for Firebase Storage.

    Returns (signed_url, storage_path).
    """
    _get_firebase_app()
    bucket = storage.bucket()

    # Create a unique path to avoid collisions
    unique_id = uuid.uuid4().hex[:12]
    storage_path = f"{folder}/{unique_id}/{file_name}"

    blob = bucket.blob(storage_path)
    signed_url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=30),
        method="PUT",
        content_type=content_type,
    )

    return signed_url, storage_path


def get_download_url(storage_path: str) -> str:
    """Generate a signed download URL for a file in Firebase Storage.

    Returns the signed URL valid for 1 hour.
    """
    _get_firebase_app()
    bucket = storage.bucket()
    blob = bucket.blob(storage_path)

    signed_url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(hours=1),
        method="GET",
    )

    return signed_url
