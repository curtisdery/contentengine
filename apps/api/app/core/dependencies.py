from fastapi import Depends, HTTPException

from app.core.firestore import get_db
from app.middleware.auth import get_current_user
from app.services.billing import TIER_LIMITS, TIER_RANK, check_and_increment  # noqa: F401


def require_tier(min_tier: str):
    """FastAPI dependency that blocks access below a certain tier."""
    async def dependency(current_user=Depends(get_current_user)):
        db = get_db()
        user_doc = await db.collection("users").document(current_user.id).get()
        user_tier = user_doc.to_dict().get("subscription_tier", "FREE")

        if TIER_RANK.get(user_tier, 0) < TIER_RANK.get(min_tier, 0):
            raise HTTPException(
                status_code=403,
                detail=f"This feature requires {min_tier} tier or higher. Current tier: {user_tier}",
            )
        return current_user
    return dependency


def require_active_subscription():
    """FastAPI dependency that blocks access if subscription is not active."""
    async def dependency(current_user=Depends(get_current_user)):
        db = get_db()
        user_doc = await db.collection("users").document(current_user.id).get()
        data = user_doc.to_dict()
        status = data.get("subscription_status", "incomplete")
        tier = data.get("subscription_tier", "FREE")

        if tier == "FREE":
            return current_user  # Free tier is always "active"

        if status not in ("active", "trialing"):
            raise HTTPException(
                status_code=402,
                detail=f"Subscription is {status}. Please update your billing at /settings/billing",
            )
        return current_user
    return dependency
