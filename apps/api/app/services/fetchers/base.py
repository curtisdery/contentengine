"""Base fetcher — NormalizedMetrics dataclass and abstract interface."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.utils.exceptions import ValidationError

logger = logging.getLogger(__name__)


@dataclass
class NormalizedMetrics:
    """Platform-agnostic engagement metrics returned by every fetcher."""

    impressions: int = 0
    engagements: int = 0
    engagement_rate: float = 0.0
    saves_bookmarks: int = 0
    shares_reposts: int = 0
    comments: int = 0
    clicks: int = 0
    follows_gained: int = 0
    platform_specific: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "impressions": self.impressions,
            "engagements": self.engagements,
            "engagement_rate": self.engagement_rate,
            "saves_bookmarks": self.saves_bookmarks,
            "shares_reposts": self.shares_reposts,
            "comments": self.comments,
            "clicks": self.clicks,
            "follows_gained": self.follows_gained,
            "platform_specific": self.platform_specific,
        }


class BaseFetcher(ABC):
    """Abstract base for platform analytics fetchers."""

    platform_id: str

    @abstractmethod
    async def fetch(self, token: str, post_id: str) -> NormalizedMetrics | None:
        """Fetch latest metrics for a published post.

        Args:
            token: Decrypted access token for the platform.
            post_id: The platform-specific post identifier.

        Returns:
            NormalizedMetrics, or None if metrics could not be fetched.
        """
        ...


# ── Registry ──────────────────────────────────────────────────────────

_REGISTRY: dict[str, BaseFetcher] = {}


def get_fetcher(platform_id: str) -> BaseFetcher:
    """Get the fetcher instance for a given platform ID."""
    if not _REGISTRY:
        from app.services.fetchers.twitter import TwitterFetcher
        from app.services.fetchers.linkedin import LinkedInFetcher
        from app.services.fetchers.instagram import InstagramFetcher
        from app.services.fetchers.youtube import YouTubeFetcher
        from app.services.fetchers.tiktok import TikTokFetcher

        for cls in [TwitterFetcher, LinkedInFetcher, InstagramFetcher, YouTubeFetcher, TikTokFetcher]:
            _REGISTRY[cls.platform_id] = cls()

    fetcher = _REGISTRY.get(platform_id)
    if not fetcher:
        raise ValidationError(
            message="Unsupported platform",
            detail=f"No analytics fetcher for '{platform_id}'.",
        )
    return fetcher
