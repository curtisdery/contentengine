import asyncio
import uuid
from typing import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app
from app.middleware.rate_limit import RateLimitMiddleware

# Use SQLite for tests (in-memory)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=False,
)

test_async_session_factory = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

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
def disable_rate_limiting():
    """Disable rate limiting during tests by making Redis unavailable to the middleware."""
    with patch.object(RateLimitMiddleware, "_get_redis", return_value=None):
        yield


@pytest.fixture(autouse=True)
def mock_firebase():
    """Mock Firebase token verification for all tests.

    Patches both import locations so that signup and get_current_user
    both use the fake claims without hitting the Firebase Admin SDK.
    """
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
    """Mock token encryption as pass-through for tests (no real Fernet key needed)."""
    identity = lambda x: x  # noqa: E731
    with patch(
        "app.services.platform_connection.encrypt_token", side_effect=identity,
    ), patch(
        "app.services.platform_connection.decrypt_token", side_effect=identity,
    ), patch(
        "app.api.v1.connections.encrypt_token", side_effect=identity,
    ), patch(
        "app.services.oauth.encrypt_token", side_effect=identity,
    ):
        yield


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    """Create all tables before each test and drop them after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional database session for tests."""
    async with test_async_session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP test client with overridden DB dependency."""

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
