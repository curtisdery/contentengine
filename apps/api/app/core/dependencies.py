from fastapi import Depends, HTTPException

from app.core.firestore import get_db
from app.middleware.auth import get_current_user
from app.services.billing import TIER_LIMITS, TIER_RANK, check_and_increment  # noqa: F401


def require_tier(min_tier: str):
    """FastAPI dependency that enforces a minimum subscription tier."""
    async def dep(current_user=Depends(get_current_user)):
        db = get_db()
        user_doc = await db.collection("users").document(current_user.id).get()
        user_tier = user_doc.to_dict().get("subscription_tier", "FREE")
        if TIER_RANK.get(user_tier, 0) < TIER_RANK[min_tier]:
            raise HTTPException(403, f"Requires {min_tier} tier or higher")
        return current_user
    return dep
