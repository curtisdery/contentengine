"""Base publisher — abstract interface for validating and publishing content."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime

from app.utils.exceptions import ValidationError

logger = logging.getLogger(__name__)


@dataclass
class PublishResult:
    """Result of a publish operation."""
    success: bool
    platform: str
    platform_post_id: str | None = None
    platform_post_url: str | None = None
    error: str | None = None
    published_at: datetime | None = None
    metadata: dict = field(default_factory=dict)


class BasePublisher(ABC):
    """Abstract base for all platform publishers."""

    platform_id: str

    def validate(self, output: dict) -> None:
        """Validate that the output meets platform requirements.

        Raises ValidationError if content is invalid for this platform.
        Override in subclasses to add platform-specific validation.
        """
        content = output.get("content", "")
        if not content and not output.get("media_urls"):
            raise ValidationError(
                message="Empty content",
                detail="Cannot publish empty content with no media.",
            )

    @abstractmethod
    async def publish(self, output: dict, token: str, **kwargs) -> PublishResult:
        """Publish content to the platform.

        Args:
            output: The generated output dict with content, media_urls, etc.
            token: Decrypted access token for the platform.
            **kwargs: Platform-specific options (e.g. refresh_token).

        Returns:
            PublishResult with success status and post details.
        """
        ...


# ── Registry ──────────────────────────────────────────────────────────

_REGISTRY: dict[str, BasePublisher] = {}


def get_publisher(platform_id: str) -> BasePublisher:
    """Get the publisher instance for a given platform ID."""
    if not _REGISTRY:
        from app.services.publishers.twitter import TwitterPublisher
        from app.services.publishers.linkedin import LinkedInPublisher
        from app.services.publishers.instagram import InstagramPublisher
        from app.services.publishers.youtube import YouTubePublisher
        from app.services.publishers.tiktok import TikTokPublisher

        for cls in [TwitterPublisher, LinkedInPublisher, InstagramPublisher, YouTubePublisher, TikTokPublisher]:
            _REGISTRY[cls.platform_id] = cls()

    publisher = _REGISTRY.get(platform_id)
    if not publisher:
        raise ValidationError(
            message="Unsupported platform",
            detail=f"No publisher found for '{platform_id}'.",
        )
    return publisher
