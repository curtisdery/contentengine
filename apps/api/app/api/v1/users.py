"""User profile API routes — Firestore-backed."""

from fastapi import APIRouter, Depends

from app.core.firestore import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


@router.get("/me")
async def get_current_user_profile(
    current_user=Depends(get_current_user),
) -> dict:
    """Get the current authenticated user's profile."""
    return current_user.to_dict()


@router.patch("/me")
async def update_current_user_profile(
    update_data: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Update the current authenticated user's profile."""
    db = get_db()
    allowed_fields = {"full_name", "avatar_url", "bio", "timezone", "notification_preferences"}
    updates = {k: v for k, v in update_data.items() if k in allowed_fields and v is not None}

    if updates:
        await db.collection("users").document(current_user.id).update(updates)

    # Return updated user
    doc = await db.collection("users").document(current_user.id).get()
    data = doc.to_dict()
    return {**data, "id": doc.id}
