"""Platform-specific analytics metric collectors.

Each collector knows how to fetch engagement metrics from a specific platform's API
and normalize them into the standard metrics dict used by AnalyticsService.record_snapshot().

Standard metrics dict:
    {
        "impressions": int,
        "engagements": int,
        "engagement_rate": float,
        "saves_bookmarks": int,
        "shares_reposts": int,
        "comments": int,
        "clicks": int,
        "follows_gained": int,
        "platform_specific": dict | None,
    }
"""

import logging
from abc import ABC, abstractmethod

import httpx

from app.models.platform_connection import PlatformConnection
from app.services.platform_connection import PlatformConnectionService

logger = logging.getLogger(__name__)
connection_service = PlatformConnectionService()


class BaseAnalyticsCollector(ABC):
    """Abstract base for platform analytics collectors."""

    @abstractmethod
    async def fetch_metrics(self, connection: PlatformConnection, post_id: str) -> dict | None:
        """Fetch latest metrics for a published post.

        Args:
            connection: The platform connection with auth credentials.
            post_id: The platform-specific post identifier.

        Returns:
            Normalized metrics dict, or None if metrics could not be fetched.
        """


# ---------------------------------------------------------------------------
# Twitter/X Analytics Collector
# ---------------------------------------------------------------------------


class TwitterAnalyticsCollector(BaseAnalyticsCollector):
    """Fetch tweet metrics via Twitter API v2.

    Uses the tweet lookup endpoint with public_metrics and non_public_metrics fields.
    Requires OAuth 2.0 user token with tweet.read scope.
    """

    async def fetch_metrics(self, connection: PlatformConnection, post_id: str) -> dict | None:
        tokens = connection_service.get_decrypted_tokens(connection)
        access_token = tokens.get("access_token")
        if not access_token:
            return None

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"https://api.twitter.com/2/tweets/{post_id}",
                    params={"tweet.fields": "public_metrics,non_public_metrics"},
                    headers={"Authorization": f"Bearer {access_token}"},
                )

                if resp.status_code == 401:
                    logger.warning("Twitter analytics: unauthorized for post %s", post_id)
                    return None

                if resp.status_code != 200:
                    logger.warning("Twitter analytics error %d for post %s", resp.status_code, post_id)
                    return None

                data = resp.json().get("data", {})
                public = data.get("public_metrics", {})
                non_public = data.get("non_public_metrics", {})

            impressions = non_public.get("impression_count", public.get("impression_count", 0))
            likes = public.get("like_count", 0)
            retweets = public.get("retweet_count", 0)
            replies = public.get("reply_count", 0)
            quotes = public.get("quote_count", 0)
            bookmarks = public.get("bookmark_count", 0)
            url_clicks = non_public.get("url_link_clicks", 0)
            profile_clicks = non_public.get("user_profile_clicks", 0)

            engagements = likes + retweets + replies + quotes
            engagement_rate = engagements / max(impressions, 1)

            return {
                "impressions": impressions,
                "engagements": engagements,
                "engagement_rate": round(engagement_rate, 6),
                "saves_bookmarks": bookmarks,
                "shares_reposts": retweets + quotes,
                "comments": replies,
                "clicks": url_clicks + profile_clicks,
                "follows_gained": 0,  # Not available per-tweet
                "platform_specific": {
                    "likes": likes,
                    "retweets": retweets,
                    "replies": replies,
                    "quotes": quotes,
                    "bookmarks": bookmarks,
                    "url_clicks": url_clicks,
                    "profile_clicks": profile_clicks,
                },
            }

        except Exception as e:
            logger.warning("Failed to fetch Twitter metrics for post %s: %s", post_id, e)
            return None


# ---------------------------------------------------------------------------
# LinkedIn Analytics Collector
# ---------------------------------------------------------------------------


class LinkedInAnalyticsCollector(BaseAnalyticsCollector):
    """Fetch LinkedIn post metrics via Marketing API.

    Uses the socialActions and shareStatistics endpoints.
    """

    async def fetch_metrics(self, connection: PlatformConnection, post_id: str) -> dict | None:
        tokens = connection_service.get_decrypted_tokens(connection)
        access_token = tokens.get("access_token")
        if not access_token:
            return None

        headers = {
            "Authorization": f"Bearer {access_token}",
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": "202401",
        }

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # Fetch share statistics
                stats_resp = await client.get(
                    "https://api.linkedin.com/rest/organizationalEntityShareStatistics",
                    params={
                        "q": "organizationalEntity",
                        "shares": f"List({post_id})",
                    },
                    headers=headers,
                )

                impressions = 0
                clicks = 0
                likes = 0
                comments = 0
                shares = 0

                if stats_resp.status_code == 200:
                    elements = stats_resp.json().get("elements", [])
                    if elements:
                        stats = elements[0].get("totalShareStatistics", {})
                        impressions = stats.get("impressionCount", 0)
                        clicks = stats.get("clickCount", 0)
                        likes = stats.get("likeCount", 0)
                        comments = stats.get("commentCount", 0)
                        shares = stats.get("shareCount", 0)
                else:
                    # Fallback: try social actions endpoint for engagement counts
                    actions_resp = await client.get(
                        f"https://api.linkedin.com/rest/socialActions/{post_id}",
                        headers=headers,
                    )
                    if actions_resp.status_code == 200:
                        data = actions_resp.json()
                        likes = data.get("likesSummary", {}).get("totalLikes", 0)
                        comments = data.get("commentsSummary", {}).get("totalFirstLevelComments", 0)

            engagements = likes + comments + shares + clicks
            engagement_rate = engagements / max(impressions, 1)

            return {
                "impressions": impressions,
                "engagements": engagements,
                "engagement_rate": round(engagement_rate, 6),
                "saves_bookmarks": 0,  # Not available via LinkedIn API
                "shares_reposts": shares,
                "comments": comments,
                "clicks": clicks,
                "follows_gained": 0,  # Not available per-post
                "platform_specific": {
                    "likes": likes,
                    "comments": comments,
                    "shares": shares,
                    "clicks": clicks,
                    "impressions": impressions,
                },
            }

        except Exception as e:
            logger.warning("Failed to fetch LinkedIn metrics for post %s: %s", post_id, e)
            return None


# ---------------------------------------------------------------------------
# Bluesky Analytics Collector
# ---------------------------------------------------------------------------


class BlueskyAnalyticsCollector(BaseAnalyticsCollector):
    """Fetch Bluesky post metrics via AT Protocol.

    Uses getPostThread to get like/repost/reply counts.
    Bluesky doesn't provide impression data.
    """

    PDS_URL = "https://bsky.social/xrpc"

    async def fetch_metrics(self, connection: PlatformConnection, post_id: str) -> dict | None:
        tokens = connection_service.get_decrypted_tokens(connection)
        app_password = tokens.get("access_token")
        handle = connection.platform_username
        did = connection.platform_user_id

        if not app_password or not (handle or did):
            return None

        try:
            # Create session
            async with httpx.AsyncClient(timeout=10) as client:
                session_resp = await client.post(
                    f"{self.PDS_URL}/com.atproto.server.createSession",
                    json={"identifier": handle or did, "password": app_password},
                )
                if session_resp.status_code != 200:
                    return None

                access_jwt = session_resp.json()["accessJwt"]

                # Fetch post thread to get engagement counts
                thread_resp = await client.get(
                    f"{self.PDS_URL}/app.bsky.feed.getPostThread",
                    params={"uri": post_id, "depth": 0},
                    headers={"Authorization": f"Bearer {access_jwt}"},
                )

                if thread_resp.status_code != 200:
                    logger.warning("Bluesky analytics error %d for post %s", thread_resp.status_code, post_id)
                    return None

                thread = thread_resp.json().get("thread", {})
                post = thread.get("post", {})

            likes = post.get("likeCount", 0)
            reposts = post.get("repostCount", 0)
            replies = post.get("replyCount", 0)
            quotes = post.get("quoteCount", 0)

            # Bluesky doesn't provide impressions, estimate from engagement
            engagements = likes + reposts + replies + quotes
            # Use a rough estimate: engagement rate ~5% on Bluesky, so impressions ≈ engagements * 20
            estimated_impressions = engagements * 20 if engagements > 0 else 0
            engagement_rate = engagements / max(estimated_impressions, 1) if estimated_impressions > 0 else 0.0

            return {
                "impressions": estimated_impressions,
                "engagements": engagements,
                "engagement_rate": round(engagement_rate, 6),
                "saves_bookmarks": 0,  # Not available on Bluesky
                "shares_reposts": reposts + quotes,
                "comments": replies,
                "clicks": 0,  # Not available on Bluesky
                "follows_gained": 0,  # Not available per-post
                "platform_specific": {
                    "likes": likes,
                    "reposts": reposts,
                    "replies": replies,
                    "quotes": quotes,
                    "impressions_estimated": True,
                },
            }

        except Exception as e:
            logger.warning("Failed to fetch Bluesky metrics for post %s: %s", post_id, e)
            return None


# ---------------------------------------------------------------------------
# Collector Registry
# ---------------------------------------------------------------------------


class AnalyticsCollectorRegistry:
    """Registry mapping platform_id to analytics collector implementations."""

    _collectors: dict[str, BaseAnalyticsCollector] = {}

    @classmethod
    def register(cls, platform_id: str, collector: BaseAnalyticsCollector) -> None:
        cls._collectors[platform_id] = collector

    @classmethod
    def get(cls, platform_id: str) -> BaseAnalyticsCollector | None:
        return cls._collectors.get(platform_id)

    @classmethod
    def get_supported_platforms(cls) -> list[str]:
        return list(cls._collectors.keys())


def init_collectors() -> None:
    """Register all analytics collector implementations."""
    _twitter = TwitterAnalyticsCollector()
    _linkedin = LinkedInAnalyticsCollector()
    _bluesky = BlueskyAnalyticsCollector()

    AnalyticsCollectorRegistry.register("twitter_single", _twitter)
    AnalyticsCollectorRegistry.register("twitter_thread", _twitter)
    AnalyticsCollectorRegistry.register("linkedin_post", _linkedin)
    AnalyticsCollectorRegistry.register("linkedin_article", _linkedin)
    AnalyticsCollectorRegistry.register("bluesky_post", _bluesky)

    logger.info(
        "Initialized %d analytics collectors: %s",
        len(AnalyticsCollectorRegistry.get_supported_platforms()),
        ", ".join(AnalyticsCollectorRegistry.get_supported_platforms()),
    )


# Auto-initialize on import
init_collectors()
