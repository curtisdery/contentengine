"""A/B testing API routes — Firestore-backed."""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Query, status

from app.core.firestore import get_db
from app.middleware.auth import get_current_user
from app.utils.exceptions import NotFoundError

router = APIRouter()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ab_test(
    request_body: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Create an A/B test between two output variants."""
    db = get_db()
    now = datetime.now(timezone.utc)
    doc_id = str(uuid4())

    test_data = {
        "user_id": current_user.id,
        "content_upload_id": request_body.get("content_upload_id", ""),
        "platform_id": request_body.get("platform_id", ""),
        "variant_a_output_id": request_body.get("variant_a_output_id", ""),
        "variant_b_output_id": request_body.get("variant_b_output_id", ""),
        "status": "draft",
        "winner": None,
        "variant_a_metrics": {},
        "variant_b_metrics": {},
        "created_at": now,
        "updated_at": now,
    }
    await db.collection("ab_tests").document(doc_id).set(test_data)

    return {**test_data, "id": doc_id}


@router.get("")
async def list_ab_tests(
    status_filter: str | None = Query(None, alias="status"),
    current_user=Depends(get_current_user),
) -> list[dict]:
    """List A/B tests, optionally filtered by status."""
    db = get_db()
    query = db.collection("ab_tests").where("user_id", "==", current_user.id)

    tests = []
    async for doc in query.stream():
        data = doc.to_dict()
        if status_filter and data.get("status") != status_filter:
            continue
        tests.append({**data, "id": doc.id})

    return tests


@router.get("/{test_id}")
async def get_ab_test(
    test_id: str,
    current_user=Depends(get_current_user),
) -> dict:
    """Get a single A/B test."""
    db = get_db()
    doc = await db.collection("ab_tests").document(test_id).get()

    if not doc.exists:
        raise NotFoundError(message="A/B test not found", detail=f"No A/B test found with id {test_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="A/B test not found", detail=f"No A/B test found with id {test_id}")

    return {**data, "id": doc.id}


@router.post("/{test_id}/start")
async def start_ab_test(
    test_id: str,
    current_user=Depends(get_current_user),
) -> dict:
    """Start an A/B test (schedule both variants for publishing)."""
    db = get_db()
    doc = await db.collection("ab_tests").document(test_id).get()

    if not doc.exists:
        raise NotFoundError(message="A/B test not found", detail=f"No A/B test found with id {test_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="A/B test not found", detail=f"No A/B test found with id {test_id}")

    await db.collection("ab_tests").document(test_id).update({
        "status": "running",
        "started_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })

    data["status"] = "running"
    return {**data, "id": doc.id}


@router.post("/{test_id}/evaluate")
async def evaluate_ab_test(
    test_id: str,
    current_user=Depends(get_current_user),
) -> dict:
    """Evaluate A/B test results and declare a winner."""
    db = get_db()
    doc = await db.collection("ab_tests").document(test_id).get()

    if not doc.exists:
        raise NotFoundError(message="A/B test not found", detail=f"No A/B test found with id {test_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="A/B test not found", detail=f"No A/B test found with id {test_id}")

    # Compare engagement metrics
    a_eng = data.get("variant_a_metrics", {}).get("engagements", 0)
    b_eng = data.get("variant_b_metrics", {}).get("engagements", 0)
    winner = "A" if a_eng >= b_eng else "B"

    await db.collection("ab_tests").document(test_id).update({
        "status": "completed",
        "winner": winner,
        "completed_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })

    data["status"] = "completed"
    data["winner"] = winner
    return {**data, "id": doc.id}


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_ab_test(
    test_id: str,
    current_user=Depends(get_current_user),
) -> None:
    """Cancel an A/B test."""
    db = get_db()
    doc = await db.collection("ab_tests").document(test_id).get()

    if not doc.exists:
        raise NotFoundError(message="A/B test not found", detail=f"No A/B test found with id {test_id}")

    data = doc.to_dict()
    if data.get("user_id") != current_user.id:
        raise NotFoundError(message="A/B test not found", detail=f"No A/B test found with id {test_id}")

    await db.collection("ab_tests").document(test_id).update({
        "status": "cancelled",
        "updated_at": datetime.now(timezone.utc),
    })
