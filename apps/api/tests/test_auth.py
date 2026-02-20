"""Tests for Firebase-based authentication flow."""

import pytest
from httpx import AsyncClient

from tests.conftest import FAKE_TOKEN

SIGNUP_URL = "/api/v1/auth/signup"


@pytest.mark.asyncio
async def test_signup_success(client: AsyncClient):
    """Test that a new user can sign up via Firebase."""
    response = await client.post(
        SIGNUP_URL,
        json={"firebase_token": FAKE_TOKEN, "full_name": "Test User"},
    )
    assert response.status_code == 201

    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["full_name"] == "Test User"
    assert data["email_verified"] is True


@pytest.mark.asyncio
async def test_signup_idempotent(client: AsyncClient):
    """Test that signing up twice with the same Firebase UID returns the same user."""
    response1 = await client.post(
        SIGNUP_URL,
        json={"firebase_token": FAKE_TOKEN, "full_name": "Test User"},
    )
    assert response1.status_code == 201

    response2 = await client.post(
        SIGNUP_URL,
        json={"firebase_token": FAKE_TOKEN, "full_name": "Updated Name"},
    )
    # sync_firebase_user updates the existing user — returns 201 (idempotent create)
    assert response2.status_code == 201
    assert response2.json()["id"] == response1.json()["id"]
    assert response2.json()["full_name"] == "Updated Name"


@pytest.mark.asyncio
async def test_get_me(client: AsyncClient):
    """Test that an authenticated user can fetch their profile via /me."""
    # Create user first
    await client.post(
        SIGNUP_URL,
        json={"firebase_token": FAKE_TOKEN, "full_name": "Test User"},
    )

    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_get_me_unauthorized(client: AsyncClient):
    """Test that unauthenticated access to /me is rejected."""
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout(client: AsyncClient):
    """Test that logout succeeds."""
    # Create user first
    await client.post(
        SIGNUP_URL,
        json={"firebase_token": FAKE_TOKEN, "full_name": "Test User"},
    )

    response = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {FAKE_TOKEN}"},
    )
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Test the health check endpoint."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["version"] == "0.1.0"
