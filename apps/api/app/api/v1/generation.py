"""Content generation and platform output API routes — Firestore-backed."""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, status

from app.core.firestore import get_db
from app.middleware.auth import get_current_user
from app.utils.exceptions import NotFoundError, ValidationError

router = APIRouter()


@router.post("/{content_id}/generate", status_code=status.HTTP_201_CREATED)
async def generate_content(
    content_id: str,
    request_body: dict,
    current_user=Depends(get_current_user),
) -> list[dict]:
    """Trigger content generation for a content upload."""
    db = get_db()

    # Load and verify content
    doc = await db.collection("content_uploads").document(content_id).get()
    if not doc.exists:
        raise NotFoundError(message="Content not found", detail=f"No content upload found with id {content_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="Content not found", detail=f"No content upload found with id {content_id}")

    if data.get("status") not in ("analyzed", "completed"):
        raise ValidationError(
            message="Content not ready for generation",
            detail=f"Content status is '{data.get('status')}'. It must be 'analyzed' before generation can begin.",
        )

    # Mark as generating
    await db.collection("content_uploads").document(content_id).update({"status": "generating"})

    # Store emphasis notes if provided
    emphasis_notes = request_body.get("emphasis_notes")
    if emphasis_notes:
        dna = data.get("content_dna") or {}
        user_adjustments = dna.get("user_adjustments", {})
        user_adjustments["emphasis_notes"] = emphasis_notes
        dna["user_adjustments"] = user_adjustments
        await db.collection("content_uploads").document(content_id).update({"content_dna": dna})

    # Generation will be handled by Cloud Tasks / transformation engine
    # Return empty list — outputs will be populated asynchronously
    return []


@router.get("/{content_id}/outputs")
async def list_outputs(
    content_id: str,
    current_user=Depends(get_current_user),
) -> dict:
    """List all generated outputs for a content piece."""
    db = get_db()

    # Verify content exists and belongs to user
    content_doc = await db.collection("content_uploads").document(content_id).get()
    if not content_doc.exists:
        raise NotFoundError(message="Content not found", detail=f"No content upload found with id {content_id}")

    content_data = content_doc.to_dict()
    if content_data.get("user_id") != current_user.id:
        raise NotFoundError(message="Content not found", detail=f"No content upload found with id {content_id}")

    # Fetch outputs
    query = (
        db.collection("generated_outputs")
        .where("content_upload_id", "==", content_id)
        .order_by("created_at", direction="DESCENDING")
    )

    items = []
    async for doc in query.stream():
        items.append({**doc.to_dict(), "id": doc.id})

    return {
        "items": items,
        "total": len(items),
        "content_title": content_data.get("title", ""),
        "content_id": content_id,
    }


@router.get("/outputs/{output_id}")
async def get_output(
    output_id: str,
    current_user=Depends(get_current_user),
) -> dict:
    """Get a single generated output."""
    db = get_db()

    doc = await db.collection("generated_outputs").document(output_id).get()
    if not doc.exists:
        raise NotFoundError(message="Output not found", detail=f"No generated output found with id {output_id}")

    data = doc.to_dict()

    # Verify ownership via content upload
    content_doc = await db.collection("content_uploads").document(data.get("content_upload_id", "")).get()
    if not content_doc.exists or content_doc.to_dict().get("user_id") != current_user.id:
        raise NotFoundError(message="Output not found", detail=f"No generated output found with id {output_id}")

    return {**data, "id": doc.id}


@router.patch("/outputs/{output_id}")
async def update_output(
    output_id: str,
    request_body: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Edit output content or change its status."""
    db = get_db()

    doc = await db.collection("generated_outputs").document(output_id).get()
    if not doc.exists:
        raise NotFoundError(message="Output not found", detail=f"No generated output found with id {output_id}")

    data = doc.to_dict()

    # Verify ownership
    content_doc = await db.collection("content_uploads").document(data.get("content_upload_id", "")).get()
    if not content_doc.exists or content_doc.to_dict().get("user_id") != current_user.id:
        raise NotFoundError(message="Output not found", detail=f"No generated output found with id {output_id}")

    # Apply updates
    updates = {}
    if "content" in request_body and request_body["content"] is not None:
        updates["content"] = request_body["content"]
        metadata = data.get("output_metadata") or {}
        metadata["manually_edited"] = True
        updates["output_metadata"] = metadata

    if "status" in request_body and request_body["status"] is not None:
        updates["status"] = request_body["status"]

    if updates:
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.collection("generated_outputs").document(output_id).update(updates)
        data.update(updates)

    return {**data, "id": doc.id}


@router.post("/outputs/bulk-approve")
async def bulk_approve_outputs(
    request_body: dict,
    current_user=Depends(get_current_user),
) -> list[dict]:
    """Bulk approve multiple outputs at once."""
    db = get_db()
    output_ids = request_body.get("output_ids", [])
    approved = []

    for output_id in output_ids:
        doc = await db.collection("generated_outputs").document(output_id).get()
        if not doc.exists:
            continue

        data = doc.to_dict()
        content_doc = await db.collection("content_uploads").document(data.get("content_upload_id", "")).get()
        if not content_doc.exists or content_doc.to_dict().get("user_id") != current_user.id:
            continue

        await db.collection("generated_outputs").document(output_id).update({
            "status": "approved",
            "updated_at": datetime.now(timezone.utc),
        })
        data["status"] = "approved"
        approved.append({**data, "id": doc.id})

    return approved


@router.delete("/outputs/{output_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_output(
    output_id: str,
    current_user=Depends(get_current_user),
) -> None:
    """Delete a generated output."""
    db = get_db()

    doc = await db.collection("generated_outputs").document(output_id).get()
    if not doc.exists:
        raise NotFoundError(message="Output not found", detail=f"No generated output found with id {output_id}")

    data = doc.to_dict()
    content_doc = await db.collection("content_uploads").document(data.get("content_upload_id", "")).get()
    if not content_doc.exists or content_doc.to_dict().get("user_id") != current_user.id:
        raise NotFoundError(message="Output not found", detail=f"No generated output found with id {output_id}")

    await db.collection("generated_outputs").document(output_id).delete()


@router.get("/platforms")
async def list_platforms() -> list[dict]:
    """List all available platform profiles."""
    from app.platforms.profiles import get_all_platforms

    platforms = get_all_platforms()
    return [
        {
            "platform_id": p.platform_id,
            "name": p.name,
            "tier": p.tier,
            "native_tone": p.native_tone,
            "media_format": p.media_format,
            "posting_cadence": p.posting_cadence,
            "length_range": {
                "min": p.length_range.min,
                "ideal": p.length_range.ideal,
                "max": p.length_range.max,
            },
        }
        for p in platforms
    ]
