"""Brand voice profile API routes — Firestore-backed."""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, status

from app.core.firestore import get_db
from app.middleware.auth import get_current_user
from app.utils.exceptions import NotFoundError

router = APIRouter()


@router.post("/profiles", status_code=status.HTTP_201_CREATED)
async def create_voice_profile(
    request_body: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Create a new voice profile."""
    db = get_db()
    now = datetime.now(timezone.utc)
    doc_id = str(uuid4())

    profile_data = {
        "user_id": current_user.id,
        "name": request_body.get("name", ""),
        "description": request_body.get("description", ""),
        "tone_attributes": request_body.get("tone_attributes", []),
        "vocabulary": request_body.get("vocabulary", {}),
        "formatting": request_body.get("formatting", {}),
        "sample_content": request_body.get("sample_content", []),
        "tone_metrics": request_body.get("tone_metrics", {}),
        "cta_library": request_body.get("cta_library", []),
        "is_default": request_body.get("is_default", False),
        "created_at": now,
        "updated_at": now,
    }
    await db.collection("voice_profiles").document(doc_id).set(profile_data)

    return {**profile_data, "id": doc_id}


@router.get("/profiles")
async def list_voice_profiles(
    current_user=Depends(get_current_user),
) -> list[dict]:
    """List all voice profiles for the user."""
    db = get_db()
    query = db.collection("voice_profiles").where("user_id", "==", current_user.id)

    profiles = []
    async for doc in query.stream():
        profiles.append({**doc.to_dict(), "id": doc.id})

    return profiles


@router.get("/profiles/{profile_id}")
async def get_voice_profile(
    profile_id: str,
    current_user=Depends(get_current_user),
) -> dict:
    """Get a single voice profile."""
    db = get_db()
    doc = await db.collection("voice_profiles").document(profile_id).get()

    if not doc.exists:
        raise NotFoundError(message="Voice profile not found", detail=f"No voice profile found with id {profile_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="Voice profile not found", detail=f"No voice profile found with id {profile_id}")

    return {**data, "id": doc.id}


@router.patch("/profiles/{profile_id}")
async def update_voice_profile(
    profile_id: str,
    request_body: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Update an existing voice profile."""
    db = get_db()
    doc = await db.collection("voice_profiles").document(profile_id).get()

    if not doc.exists:
        raise NotFoundError(message="Voice profile not found", detail=f"No voice profile found with id {profile_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="Voice profile not found", detail=f"No voice profile found with id {profile_id}")

    allowed_fields = {"name", "description", "tone_attributes", "vocabulary", "formatting",
                      "sample_content", "tone_metrics", "cta_library", "is_default"}
    updates = {k: v for k, v in request_body.items() if k in allowed_fields and v is not None}
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.collection("voice_profiles").document(profile_id).update(updates)
        data.update(updates)

    return {**data, "id": doc.id}


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_voice_profile(
    profile_id: str,
    current_user=Depends(get_current_user),
) -> None:
    """Delete a voice profile."""
    db = get_db()
    doc = await db.collection("voice_profiles").document(profile_id).get()

    if not doc.exists:
        raise NotFoundError(message="Voice profile not found", detail=f"No voice profile found with id {profile_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="Voice profile not found", detail=f"No voice profile found with id {profile_id}")

    await db.collection("voice_profiles").document(profile_id).delete()


@router.post("/analyze-samples")
async def analyze_voice_samples(
    request_body: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Analyze content samples and return voice characteristics without saving."""
    # Return placeholder analysis — actual AI analysis via FORGE
    samples = request_body.get("samples", [])
    return {
        "tone_metrics": {},
        "vocabulary_patterns": {},
        "signature_phrases": [],
        "suggested_attributes": [],
        "samples_analyzed": len(samples),
    }
