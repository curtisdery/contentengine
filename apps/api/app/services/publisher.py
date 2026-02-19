"""Platform publishing service — abstract base and stub implementations.

Defines the BasePlatformPublisher interface and provides stub implementations
for each supported platform. Real API integrations will replace these stubs
in Sprint 9+.
"""

import logging
from abc import ABC, abstractmethod

from app.models.platform_connection import PlatformConnection

logger = logging.getLogger(__name__)


class BasePlatformPublisher(ABC):
    """Abstract base class for platform publishers."""

    @abstractmethod
    async def publish(
        self,
        content: str,
        metadata: dict,
        connection: PlatformConnection,
    ) -> dict:
        """Publish content to the platform.

        Returns:
            {
                "success": bool,
                "post_id": str | None,
                "url": str | None,
                "error": str | None,
            }
        """

    @abstractmethod
    async def validate_connection(self, connection: PlatformConnection) -> bool:
        """Check if the platform connection is still valid (token not expired, etc.)."""

    @abstractmethod
    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        """Refresh an expired OAuth token. Returns the updated connection."""


# ---------------------------------------------------------------------------
# Stub implementations — Sprint 7-8
# Each returns a "not yet implemented" response with a helpful message.
# Real API calls will be wired in Sprint 9+.
# ---------------------------------------------------------------------------


class TwitterPublisher(BasePlatformPublisher):
    """Twitter/X API v2 publisher. Stub for Sprint 7-8."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        # TECH_DEBT: Wire up Twitter API v2 in Sprint 9+
        logger.info("TwitterPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "Twitter publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class LinkedInPublisher(BasePlatformPublisher):
    """LinkedIn Marketing API publisher. Stub for Sprint 7-8."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("LinkedInPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "LinkedIn publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class InstagramPublisher(BasePlatformPublisher):
    """Instagram Graph API publisher. Stub for Sprint 7-8."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("InstagramPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "Instagram publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class YouTubePublisher(BasePlatformPublisher):
    """YouTube Data API v3 publisher. Stub for Sprint 7-8."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("YouTubePublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "YouTube publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class TikTokPublisher(BasePlatformPublisher):
    """TikTok Content Posting API publisher. Stub for Sprint 7-8."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("TikTokPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "TikTok publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class BlueskyPublisher(BasePlatformPublisher):
    """Bluesky AT Protocol publisher. Stub for Sprint 7-8."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("BlueskyPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "Bluesky publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class PinterestPublisher(BasePlatformPublisher):
    """Pinterest API v5 publisher. Stub for Sprint 7-8."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("PinterestPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "Pinterest publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class RedditPublisher(BasePlatformPublisher):
    """Reddit API publisher. Stub for Sprint 7-8."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("RedditPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "Reddit publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class MediumPublisher(BasePlatformPublisher):
    """Medium API publisher. Stub for Sprint 7-8."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("MediumPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "Medium publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class QuoraPublisher(BasePlatformPublisher):
    """Quora publisher. Stub for Sprint 7-8."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("QuoraPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "Quora publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


# ---------------------------------------------------------------------------
# Publisher Registry
# ---------------------------------------------------------------------------


class PublisherRegistry:
    """Registry mapping platform_id to publisher implementations."""

    _publishers: dict[str, BasePlatformPublisher] = {}

    @classmethod
    def register(cls, platform_id: str, publisher: BasePlatformPublisher) -> None:
        cls._publishers[platform_id] = publisher

    @classmethod
    def get(cls, platform_id: str) -> BasePlatformPublisher | None:
        return cls._publishers.get(platform_id)

    @classmethod
    def is_supported(cls, platform_id: str) -> bool:
        return platform_id in cls._publishers

    @classmethod
    def get_supported_platforms(cls) -> list[str]:
        return list(cls._publishers.keys())


def init_publishers() -> None:
    """Register all platform publisher implementations.

    Called at application startup to populate the PublisherRegistry.
    """
    _twitter = TwitterPublisher()
    _linkedin = LinkedInPublisher()
    _instagram = InstagramPublisher()
    _youtube = YouTubePublisher()
    _tiktok = TikTokPublisher()
    _bluesky = BlueskyPublisher()
    _pinterest = PinterestPublisher()
    _reddit = RedditPublisher()
    _medium = MediumPublisher()
    _quora = QuoraPublisher()

    # Tier 1 — Primary text-first social
    PublisherRegistry.register("twitter_single", _twitter)
    PublisherRegistry.register("twitter_thread", _twitter)
    PublisherRegistry.register("linkedin_post", _linkedin)
    PublisherRegistry.register("linkedin_article", _linkedin)
    PublisherRegistry.register("bluesky_post", _bluesky)

    # Tier 2 — Visual-first and discovery
    PublisherRegistry.register("instagram_carousel", _instagram)
    PublisherRegistry.register("instagram_caption", _instagram)
    PublisherRegistry.register("pinterest_pin", _pinterest)

    # Tier 3 — Long-form written
    PublisherRegistry.register("medium_post", _medium)

    # Tier 4 — Video and audio
    PublisherRegistry.register("youtube_longform", _youtube)
    PublisherRegistry.register("short_form_video", _tiktok)

    # Tier 5 — Community and Q&A
    PublisherRegistry.register("reddit_post", _reddit)
    PublisherRegistry.register("quora_answer", _quora)

    logger.info(
        "Initialized %d platform publishers: %s",
        len(PublisherRegistry.get_supported_platforms()),
        ", ".join(PublisherRegistry.get_supported_platforms()),
    )
