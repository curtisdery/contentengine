from datetime import datetime, timedelta
from google.cloud import firestore


async def check_rate_limit(db, key: str, max_requests: int, window_seconds: int) -> bool:
    doc_ref = db.collection("rate_limits").document(key)
    now = datetime.utcnow()

    @firestore.async_transactional
    async def update_in_transaction(transaction):
        doc = await doc_ref.get(transaction=transaction)
        if doc.exists:
            data = doc.to_dict()
            window_start = data["window_start"]
            if (now - window_start).total_seconds() > window_seconds:
                transaction.set(doc_ref, {"count": 1, "window_start": now, "expires_at": now + timedelta(seconds=window_seconds)})
                return True
            elif data["count"] < max_requests:
                transaction.update(doc_ref, {"count": data["count"] + 1})
                return True
            else:
                return False
        else:
            transaction.set(doc_ref, {"count": 1, "window_start": now, "expires_at": now + timedelta(seconds=window_seconds)})
            return True

    transaction = db.transaction()
    return await update_in_transaction(transaction)
