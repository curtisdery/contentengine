from google.cloud import firestore
from functools import lru_cache

@lru_cache()
def get_db() -> firestore.AsyncClient:
    return firestore.AsyncClient()

# Usage in any service:
# db = get_db()
# doc = await db.collection("users").document(user_id).get()
