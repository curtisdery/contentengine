"""Content upload and DNA card API routes — Firestore-backed."""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Query, status

from app.core.firestore import get_db
from app.middleware.auth import get_current_user
from app.utils.exceptions import NotFoundError, ValidationError
from app.utils.storage import generate_upload_url

router = APIRouter()


@router.post("/upload-url")
async def get_upload_url(
    request_body: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Generate a signed upload URL for Firebase Storage."""
    upload_url, storage_path = generate_upload_url(
        file_name=request_body.get("file_name", ""),
        content_type=request_body.get("content_type", ""),
    )
    return {"upload_url": upload_url, "storage_path": storage_path}


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_content(
    request_body: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Upload content for analysis and DNA card generation."""
    raw_content = request_body.get("raw_content")
    storage_path = request_body.get("storage_path")

    if not raw_content and not storage_path:
        raise ValidationError(
            message="Content required",
            detail="Either raw_content or storage_path must be provided",
        )

    db = get_db()
    now = datetime.now(timezone.utc)
    doc_id = str(uuid4())

    content_data = {
        "user_id": current_user.id,
        "title": request_body.get("title", ""),
        "content_type": request_body.get("content_type", "text"),
        "raw_content": raw_content,
        "storage_path": storage_path,
        "source_url": request_body.get("source_url"),
        "status": "uploaded",
        "content_dna": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.collection("content_uploads").document(doc_id).set(content_data)

    return {**content_data, "id": doc_id}


@router.get("")
async def list_content(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_user),
) -> dict:
    """List the user's content uploads with pagination."""
    db = get_db()

    # Fetch all user content ordered by created_at desc
    query = (
        db.collection("content_uploads")
        .where("user_id", "==", current_user.id)
        .order_by("created_at", direction="DESCENDING")
    )

    all_items = []
    async for doc in query.stream():
        all_items.append({**doc.to_dict(), "id": doc.id})

    total = len(all_items)
    offset = (page - 1) * page_size
    items = all_items[offset : offset + page_size]

    return {"items": items, "total": total}


@router.get("/{content_id}")
async def get_content(
    content_id: str,
    current_user=Depends(get_current_user),
) -> dict:
    """Get a single content upload with its DNA card."""
    db = get_db()
    doc = await db.collection("content_uploads").document(content_id).get()

    if not doc.exists:
        raise NotFoundError(message="Content not found", detail=f"No content upload found with id {content_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="Content not found", detail=f"No content upload found with id {content_id}")

    return {**data, "id": doc.id}


@router.post("/{content_id}/analyze")
async def analyze_content(
    content_id: str,
    current_user=Depends(get_current_user),
) -> dict:
    """Trigger or re-trigger AI analysis on existing content."""
    db = get_db()
    doc = await db.collection("content_uploads").document(content_id).get()

    if not doc.exists:
        raise NotFoundError(message="Content not found", detail=f"No content upload found with id {content_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="Content not found", detail=f"No content upload found with id {content_id}")

    # Mark as analyzing
    await db.collection("content_uploads").document(content_id).update({"status": "analyzing"})

    # Return current state (analysis will be triggered async via Cloud Tasks)
    data["status"] = "analyzing"
    return {**data, "id": doc.id}


@router.patch("/{content_id}")
async def update_content(
    content_id: str,
    request_body: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Update emphasis notes or focus settings on a content upload."""
    db = get_db()
    doc = await db.collection("content_uploads").document(content_id).get()

    if not doc.exists:
        raise NotFoundError(message="Content not found", detail=f"No content upload found with id {content_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="Content not found", detail=f"No content upload found with id {content_id}")

    # Update the DNA card with emphasis/focus metadata
    dna = data.get("content_dna") or {}
    update_fields = {k: v for k, v in request_body.items() if v is not None}
    if update_fields:
        dna["user_adjustments"] = update_fields
        await db.collection("content_uploads").document(content_id).update({
            "content_dna": dna,
            "updated_at": datetime.now(timezone.utc),
        })
        data["content_dna"] = dna

    return {**data, "id": doc.id}


@router.delete("/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content(
    content_id: str,
    current_user=Depends(get_current_user),
) -> None:
    """Delete a content upload."""
    db = get_db()
    doc = await db.collection("content_uploads").document(content_id).get()

    if not doc.exists:
        raise NotFoundError(message="Content not found", detail=f"No content upload found with id {content_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="Content not found", detail=f"No content upload found with id {content_id}")

    await db.collection("content_uploads").document(content_id).delete()
