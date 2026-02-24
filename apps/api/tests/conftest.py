import asyncio
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app

# ---------------------------------------------------------------------------
# Fake Firebase claims used by all tests
# ---------------------------------------------------------------------------
FAKE_FIREBASE_UID = "test_firebase_uid_12345"
FAKE_FIREBASE_CLAIMS = {
    "uid": FAKE_FIREBASE_UID,
    "email": "test@example.com",
    "name": "Test User",
    "picture": None,
    "email_verified": True,
}
FAKE_TOKEN = "fake_firebase_id_token"


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
def mock_firebase():
    """Mock Firebase token verification for all tests."""
    with patch(
        "app.api.v1.auth.verify_firebase_token",
        return_value=FAKE_FIREBASE_CLAIMS,
    ), patch(
        "app.middleware.auth.verify_firebase_token",
        return_value=FAKE_FIREBASE_CLAIMS,
    ):
        yield


@pytest.fixture(autouse=True)
def mock_encryption():
    """Mock token encryption as pass-through for tests."""
    identity = lambda x: x  # noqa: E731
    with patch(
        "app.api.v1.connections.encrypt_token", side_effect=identity,
    ), patch(
        "app.services.oauth.encrypt_token", side_effect=identity,
    ):
        yield


# ---------------------------------------------------------------------------
# Firestore mock helpers (shared across all test files)
# ---------------------------------------------------------------------------


def _make_doc(doc_id: str, data: dict):
    """Create a mock Firestore document snapshot."""
    doc = MagicMock()
    doc.id = doc_id
    doc.exists = True
    doc.to_dict.return_value = data
    return doc


def _doc_ref(doc_id: str = "mock-id"):
    """Create a mock Firestore document reference."""
    ref = AsyncMock()
    ref.id = doc_id
    return ref


def _collection_with_docs(docs: list):
    """Create a mock collection query that streams the given docs."""
    query = MagicMock()

    async def _stream():
        for doc in docs:
            yield doc

    query.stream = _stream
    query.where = MagicMock(return_value=query)
    query.order_by = MagicMock(return_value=query)
    query.limit = MagicMock(return_value=query)
    return query


def _empty_stream():
    """Create a mock collection query that yields nothing."""
    return _collection_with_docs([])


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac
