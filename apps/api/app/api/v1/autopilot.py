"""Autopilot configuration and trust-based auto-publishing API routes — Firestore-backed."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status

from app.core.firestore import get_db
from app.middleware.auth import get_current_user
from app.utils.exceptions import NotFoundError

router = APIRouter()


@router.get("/summary")
async def get_autopilot_summary(
    current_user=Depends(get_current_user),
) -> dict:
    """Autopilot summary across all platforms."""
    db = get_db()
    query = db.collection("autopilot_configs").where("user_id", "==", current_user.id)

    configs = []
    async for doc in query.stream():
        configs.append({**doc.to_dict(), "id": doc.id})

    enabled_count = sum(1 for c in configs if c.get("enabled"))
    return {
        "total_platforms": len(configs),
        "enabled_count": enabled_count,
        "configs": configs,
    }


@router.get("/config/{platform_id}")
async def get_autopilot_config(
    platform_id: str,
    current_user=Depends(get_current_user),
) -> dict:
    """Get autopilot config for a specific platform."""
    db = get_db()
    query = (
        db.collection("autopilot_configs")
        .where("user_id", "==", current_user.id)
        .where("platform_id", "==", platform_id)
        .limit(1)
    )

    async for doc in query.stream():
        return {**doc.to_dict(), "id": doc.id}

    raise NotFoundError(
        message="Autopilot config not found",
        detail=f"No autopilot config found for platform {platform_id}",
    )


@router.get("/eligibility/{platform_id}")
async def check_eligibility(
    platform_id: str,
    current_user=Depends(get_current_user),
) -> dict:
    """Check if a platform is eligible for autopilot."""
    db = get_db()

    # Check if platform is connected
    conn_query = (
        db.collection("connected_platforms")
        .where("user_id", "==", current_user.id)
        .where("platform_id", "==", platform_id)
        .where("is_active", "==", True)
        .limit(1)
    )

    connected = False
    async for _ in conn_query.stream():
        connected = True
        break

    # Check published post count
    post_query = (
        db.collection("scheduled_posts")
        .where("user_id", "==", current_user.id)
        .where("platform", "==", platform_id)
        .where("status", "==", "published")
    )

    published_count = 0
    async for _ in post_query.stream():
        published_count += 1

    eligible = connected and published_count >= 5

    return {
        "platform_id": platform_id,
        "is_eligible": eligible,
        "is_connected": connected,
        "published_count": published_count,
        "required_count": 5,
    }


@router.post("/enable")
async def enable_autopilot(
    request_body: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Enable autopilot for a platform."""
    db = get_db()
    platform_id = request_body.get("platform_id", "")
    now = datetime.now(timezone.utc)

    # Check for existing config
    query = (
        db.collection("autopilot_configs")
        .where("user_id", "==", current_user.id)
        .where("platform_id", "==", platform_id)
        .limit(1)
    )

    existing = None
    async for doc in query.stream():
        existing = doc
        break

    if existing:
        await db.collection("autopilot_configs").document(existing.id).update({
            "enabled": True,
            "updated_at": now,
        })
        data = existing.to_dict()
        data["enabled"] = True
        return {**data, "id": existing.id}

    # Create new config
    config_data = {
        "user_id": current_user.id,
        "platform_id": platform_id,
        "enabled": True,
        "required_approval_rate": 0.8,
        "required_minimum_reviews": 10,
        "total_reviews": 0,
        "approved_reviews": 0,
        "edited_reviews": 0,
        "trust_score": 0.0,
        "created_at": now,
        "updated_at": now,
    }
    ref = db.collection("autopilot_configs").document()
    await ref.set(config_data)
    return {**config_data, "id": ref.id}


@router.post("/disable/{platform_id}")
async def disable_autopilot(
    platform_id: str,
    current_user=Depends(get_current_user),
) -> dict:
    """Disable autopilot for a platform."""
    db = get_db()
    query = (
        db.collection("autopilot_configs")
        .where("user_id", "==", current_user.id)
        .where("platform_id", "==", platform_id)
        .limit(1)
    )

    async for doc in query.stream():
        await db.collection("autopilot_configs").document(doc.id).update({
            "enabled": False,
            "updated_at": datetime.now(timezone.utc),
        })
        data = doc.to_dict()
        data["enabled"] = False
        return {**data, "id": doc.id}

    raise NotFoundError(
        message="Autopilot config not found",
        detail=f"No autopilot config found for platform {platform_id}",
    )


@router.patch("/thresholds/{platform_id}")
async def update_thresholds(
    platform_id: str,
    request_body: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Update autopilot thresholds for a platform."""
    db = get_db()
    query = (
        db.collection("autopilot_configs")
        .where("user_id", "==", current_user.id)
        .where("platform_id", "==", platform_id)
        .limit(1)
    )

    async for doc in query.stream():
        updates = {}
        if "required_approval_rate" in request_body:
            updates["required_approval_rate"] = request_body["required_approval_rate"]
        if "required_minimum_reviews" in request_body:
            updates["required_minimum_reviews"] = request_body["required_minimum_reviews"]
        if updates:
            updates["updated_at"] = datetime.now(timezone.utc)
            await db.collection("autopilot_configs").document(doc.id).update(updates)

        data = doc.to_dict()
        data.update(updates)
        return {**data, "id": doc.id}

    raise NotFoundError(
        message="Autopilot config not found",
        detail=f"No autopilot config found for platform {platform_id}",
    )


@router.post("/record-review")
async def record_review(
    request_body: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Record a content review (updates trust metrics)."""
    db = get_db()
    platform_id = request_body.get("platform_id", "")
    was_edited = request_body.get("was_edited", False)

    query = (
        db.collection("autopilot_configs")
        .where("user_id", "==", current_user.id)
        .where("platform_id", "==", platform_id)
        .limit(1)
    )

    async for doc in query.stream():
        data = doc.to_dict()
        total = data.get("total_reviews", 0) + 1
        approved = data.get("approved_reviews", 0) + (0 if was_edited else 1)
        edited = data.get("edited_reviews", 0) + (1 if was_edited else 0)
        trust = round(approved / max(total, 1), 4)

        updates = {
            "total_reviews": total,
            "approved_reviews": approved,
            "edited_reviews": edited,
            "trust_score": trust,
            "updated_at": datetime.now(timezone.utc),
        }
        await db.collection("autopilot_configs").document(doc.id).update(updates)
        data.update(updates)
        return {**data, "id": doc.id}

    raise NotFoundError(
        message="Autopilot config not found",
        detail=f"No autopilot config found for platform {platform_id}",
    )


@router.post("/process-queue")
async def process_autopilot_queue(
    current_user=Depends(get_current_user),
) -> dict:
    """Process the autopilot queue — auto-schedule approved outputs for enabled platforms."""
    db = get_db()

    # Find enabled autopilot configs
    query = (
        db.collection("autopilot_configs")
        .where("user_id", "==", current_user.id)
        .where("enabled", "==", True)
    )

    enabled_platforms = []
    async for doc in query.stream():
        data = doc.to_dict()
        if data.get("trust_score", 0) >= data.get("required_approval_rate", 0.8):
            enabled_platforms.append(data.get("platform_id"))

    # Find approved but unscheduled outputs for these platforms
    scheduled = []
    for platform_id in enabled_platforms:
        out_query = (
            db.collection("generated_outputs")
            .where("user_id", "==", current_user.id)
            .where("platform_id", "==", platform_id)
            .where("status", "==", "approved")
        )
        async for doc in out_query.stream():
            scheduled.append({"output_id": doc.id, "platform_id": platform_id})

    return {"auto_scheduled": scheduled, "count": len(scheduled)}
