from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://pando:pando_dev_password@localhost:5432/pandocast"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET: str = "dev-secret-change-in-production-min-32-chars"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Stripe
    STRIPE_SECRET_KEY: str = "sk_test_placeholder"
    STRIPE_WEBHOOK_SECRET: str = "whsec_placeholder"
    STRIPE_PRICE_STARTER: str = "price_starter_placeholder"
    STRIPE_PRICE_GROWTH: str = "price_growth_placeholder"
    STRIPE_PRICE_PRO: str = "price_pro_placeholder"

    # Firebase
    FIREBASE_SERVICE_ACCOUNT_BASE64: str = ""
    FIREBASE_STORAGE_BUCKET: str = ""

    # AI
    ANTHROPIC_API_KEY: str = ""

    # Application
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:8000"
    ENVIRONMENT: str = "development"
    APP_VERSION: str = "0.1.0"

    # Token encryption
    TOKEN_ENCRYPTION_KEY: str = ""

    # Platform OAuth credentials
    TWITTER_CLIENT_ID: str = ""
    TWITTER_CLIENT_SECRET: str = ""
    LINKEDIN_CLIENT_ID: str = ""
    LINKEDIN_CLIENT_SECRET: str = ""
    INSTAGRAM_CLIENT_ID: str = ""
    INSTAGRAM_CLIENT_SECRET: str = ""
    FACEBOOK_CLIENT_ID: str = ""
    FACEBOOK_CLIENT_SECRET: str = ""
    YOUTUBE_CLIENT_ID: str = ""
    YOUTUBE_CLIENT_SECRET: str = ""
    TIKTOK_CLIENT_KEY: str = ""
    TIKTOK_CLIENT_SECRET: str = ""
    PINTEREST_CLIENT_ID: str = ""
    PINTEREST_CLIENT_SECRET: str = ""
    REDDIT_CLIENT_ID: str = ""
    REDDIT_CLIENT_SECRET: str = ""
    MEDIUM_CLIENT_ID: str = ""
    MEDIUM_CLIENT_SECRET: str = ""
    THREADS_CLIENT_ID: str = ""
    THREADS_CLIENT_SECRET: str = ""

    # Account lockout
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 15

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
