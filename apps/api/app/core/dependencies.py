from datetime import datetime

from fastapi import Depends, HTTPException
from google.cloud import firestore

from app.core.firestore import get_db
from app.services.billing import TIER_LIMITS
from app.middleware.auth import get_current_user

TIER_RANK = {"FREE": 0, "STARTER": 1, "GROWTH": 2, "PRO": 3}


def require_tier(min_tier: str):
    async def dep(current_user=Depends(get_current_user)):
        db = get_db()
        user_doc = await db.collection("users").document(current_user.id).get()
        user_tier = user_doc.to_dict().get("subscription_tier", "FREE")
        if TIER_RANK.get(user_tier, 0) < TIER_RANK[min_tier]:
            raise HTTPException(403, f"Requires {min_tier} tier or higher")
        return current_user
    return dep


async def check_and_increment(user_id: str, limit_key: str):
    db = get_db()
    user_ref = db.collection("users").document(user_id)

    @firestore.async_transactional
    async def txn(transaction):
        user_doc = await user_ref.get(transaction=transaction)
        data = user_doc.to_dict()
        tier = data.get("subscription_tier", "FREE")
        usage = data.get("usage_this_period", {})
        current = usage.get(limit_key, 0)
        limit = TIER_LIMITS[tier].get(limit_key, -1)
        if limit != -1 and current >= limit:
            raise HTTPException(403, f"Tier limit reached: {current}/{limit} {limit_key}")
        transaction.update(user_ref, {
            f"usage_this_period.{limit_key}": current + 1,
            "updated_at": datetime.utcnow(),
        })

    await txn(db.transaction())
