import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Stripe
    STRIPE_SECRET_KEY: str = os.environ.get("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET: str = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    STRIPE_PUBLISHABLE_KEY: str = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")

    # After creating products in Stripe dashboard, fill these in
    STRIPE_PRICE_IDS: dict = {
        "STARTER": {
            "monthly": os.environ.get("STRIPE_PRICE_STARTER_MONTHLY", ""),
            "annual": os.environ.get("STRIPE_PRICE_STARTER_ANNUAL", ""),
        },
        "GROWTH": {
            "monthly": os.environ.get("STRIPE_PRICE_GROWTH_MONTHLY", ""),
            "annual": os.environ.get("STRIPE_PRICE_GROWTH_ANNUAL", ""),
        },
        "PRO": {
            "monthly": os.environ.get("STRIPE_PRICE_PRO_MONTHLY", ""),
            "annual": os.environ.get("STRIPE_PRICE_PRO_ANNUAL", ""),
        },
        "AGENCY": {
            "monthly": os.environ.get("STRIPE_PRICE_AGENCY_MONTHLY", ""),
            "annual": os.environ.get("STRIPE_PRICE_AGENCY_ANNUAL", ""),
        },
    }

    FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "http://localhost:3000")

    # Firebase
    FIREBASE_SERVICE_ACCOUNT_BASE64: str = ""
    FIREBASE_STORAGE_BUCKET: str = ""

    # AI
    ANTHROPIC_API_KEY: str = ""

    # Application
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

    # Cloud Tasks
    WORKER_URL: str = "http://localhost:8000"
    GCP_PROJECT: str = ""
    GCP_LOCATION: str = "us-central1"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
