"""YouTube fetcher — video statistics via Data API v3."""

import logging

import httpx

from app.services.fetchers.base import BaseFetcher, NormalizedMetrics

logger = logging.getLogger(__name__)

DATA_API = "https://www.googleapis.com/youtube/v3"


class YouTubeFetcher(BaseFetcher):
    """Fetch YouTube video statistics via Data API v3.

    Uses the videos.list endpoint with part=statistics,snippet.
    Requires OAuth 2.0 token with youtube.readonly scope.
    """

    platform_id = "youtube"

    async def fetch(self, token: str, post_id: str) -> NormalizedMetrics | None:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{DATA_API}/videos",
                    params={
                        "id": post_id,
                        "part": "statistics",
                    },
                    headers={"Authorization": f"Bearer {token}"},
                )

            if resp.status_code != 200:
                logger.warning("YouTube analytics error %d for video %s", resp.status_code, post_id)
                return None

            items = resp.json().get("items", [])
            if not items:
                logger.warning("YouTube video %s not found in response", post_id)
                return None

            stats = items[0].get("statistics", {})
            views = int(stats.get("viewCount", 0))
            likes = int(stats.get("likeCount", 0))
            comments = int(stats.get("commentCount", 0))
            favorites = int(stats.get("favoriteCount", 0))

            engagements = likes + comments + favorites
            engagement_rate = round(engagements / max(views, 1), 6)

            return NormalizedMetrics(
                impressions=views,
                engagements=engagements,
                engagement_rate=engagement_rate,
                saves_bookmarks=favorites,
                shares_reposts=0,  # Not available in basic statistics
                comments=comments,
                clicks=0,  # Requires YouTube Analytics API (separate scope)
                follows_gained=0,
                platform_specific={
                    "views": views,
                    "likes": likes,
                    "comments": comments,
                    "favorites": favorites,
                },
            )

        except Exception as exc:
            logger.warning("Failed to fetch YouTube metrics for video %s: %s", post_id, exc)
            return None
