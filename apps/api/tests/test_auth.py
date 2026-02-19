import pytest
from httpx import AsyncClient


SIGNUP_URL = "/api/v1/auth/signup"
LOGIN_URL = "/api/v1/auth/login"

VALID_USER = {
    "email": "testuser@example.com",
    "password": "securepassword123",
    "full_name": "Test User",
}


@pytest.mark.asyncio
async def test_signup_success(client: AsyncClient):
    """Test that a new user can sign up successfully."""
    response = await client.post(SIGNUP_URL, json=VALID_USER)
    assert response.status_code == 201

    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == VALID_USER["email"]
    assert data["user"]["full_name"] == VALID_USER["full_name"]
    assert data["user"]["email_verified"] is False


@pytest.mark.asyncio
async def test_signup_duplicate_email(client: AsyncClient):
    """Test that signing up with an existing email fails."""
    # First signup
    response = await client.post(SIGNUP_URL, json=VALID_USER)
    assert response.status_code == 201

    # Duplicate signup
    response = await client.post(SIGNUP_URL, json=VALID_USER)
    assert response.status_code == 422

    data = response.json()
    assert data["error"] == "Email already registered"


@pytest.mark.asyncio
async def test_signup_weak_password(client: AsyncClient):
    """Test that signing up with a short password fails."""
    weak_user = {
        "email": "weak@example.com",
        "password": "short",
        "full_name": "Weak Pass",
    }
    response = await client.post(SIGNUP_URL, json=weak_user)
    # Pydantic validation will catch min_length=12 before service
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    """Test that an existing user can log in successfully."""
    # Sign up first
    await client.post(SIGNUP_URL, json=VALID_USER)

    # Login
    login_data = {
        "email": VALID_USER["email"],
        "password": VALID_USER["password"],
    }
    response = await client.post(LOGIN_URL, json=login_data)
    assert response.status_code == 200

    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == VALID_USER["email"]


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    """Test that login with wrong password fails."""
    # Sign up first
    await client.post(SIGNUP_URL, json=VALID_USER)

    # Login with wrong password
    login_data = {
        "email": VALID_USER["email"],
        "password": "wrongpassword123",
    }
    response = await client.post(LOGIN_URL, json=login_data)
    assert response.status_code == 401

    data = response.json()
    assert data["error"] == "Invalid credentials"


@pytest.mark.asyncio
async def test_login_nonexistent_email(client: AsyncClient):
    """Test that login with a non-existent email fails."""
    login_data = {
        "email": "nobody@example.com",
        "password": "doesnotmatter123",
    }
    response = await client.post(LOGIN_URL, json=login_data)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user(client: AsyncClient):
    """Test that an authenticated user can fetch their profile."""
    # Sign up
    response = await client.post(SIGNUP_URL, json=VALID_USER)
    token = response.json()["access_token"]

    # Get profile
    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == VALID_USER["email"]


@pytest.mark.asyncio
async def test_get_current_user_unauthorized(client: AsyncClient):
    """Test that unauthenticated access to profile is rejected."""
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient):
    """Test that a refresh token can be exchanged for new tokens."""
    # Sign up
    response = await client.post(SIGNUP_URL, json=VALID_USER)
    refresh_token = response.json()["refresh_token"]

    # Refresh
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    # New refresh token should be different (rotation)
    assert data["refresh_token"] != refresh_token


@pytest.mark.asyncio
async def test_logout(client: AsyncClient):
    """Test that logout invalidates the session."""
    # Sign up
    response = await client.post(SIGNUP_URL, json=VALID_USER)
    token = response.json()["access_token"]

    # Logout
    response = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
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
