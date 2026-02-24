"""Auth API routes — Firestore-backed."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response, status

from app.core.firestore import get_db
from app.middleware.auth import get_current_user
from app.utils.firebase import verify_firebase_token

router = APIRouter()


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(
    request_body: dict,
) -> dict:
    """Register or sync a Firebase-authenticated user."""
    firebase_token = request_body.get("firebase_token", "")
    full_name = request_body.get("full_name", "")
    claims = verify_firebase_token(firebase_token)

    db = get_db()
    firebase_uid = claims["uid"]
    email = claims.get("email", "")
    now = datetime.now(timezone.utc)

    # Check if user already exists
    query = db.collection("users").where("firebase_uid", "==", firebase_uid).limit(1)
    existing = None
    async for doc in query.stream():
        existing = doc
        break

    if existing:
        data = existing.to_dict()
        return {**data, "id": existing.id}

    # Create new user
    user_ref = db.collection("users").document()
    user_data = {
        "email": email,
        "firebase_uid": firebase_uid,
        "full_name": full_name or claims.get("name", email.split("@")[0]),
        "avatar_url": claims.get("picture"),
        "email_verified": claims.get("email_verified", False),
        "is_active": True,
        "tier": "starter",
        "created_at": now,
        "updated_at": now,
    }
    await user_ref.set(user_data)

    return {**user_data, "id": user_ref.id}


@router.get("/me")
async def get_me(
    current_user=Depends(get_current_user),
) -> dict:
    """Return the currently authenticated user."""
    return current_user.to_dict()


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user=Depends(get_current_user),
) -> Response:
    """Clear FCM token on logout."""
    db = get_db()
    await db.collection("users").document(current_user.id).update({"fcm_token": None})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/fcm-token")
async def save_fcm_token(
    request_body: dict,
    current_user=Depends(get_current_user),
) -> dict:
    """Save the user's FCM device token for push notifications."""
    fcm_token = request_body.get("fcm_token", "")
    db = get_db()
    await db.collection("users").document(current_user.id).update({"fcm_token": fcm_token})
    return {"message": "FCM token saved successfully"}
