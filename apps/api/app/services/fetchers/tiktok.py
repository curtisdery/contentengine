"""TikTok fetcher — video metrics via Content Posting API / Research API."""

import logging

import httpx

from app.services.fetchers.base import BaseFetcher, NormalizedMetrics

logger = logging.getLogger(__name__)

TIKTOK_API = "https://open.tiktokapis.com/v2"


class TikTokFetcher(BaseFetcher):
    """Fetch TikTok video metrics via the query endpoint.

    Uses /video/query/ with fields for view, like, comment, share counts.
    Requires OAuth 2.0 token with video.list scope.
    """

    platform_id = "tiktok"

    async def fetch(self, token: str, post_id: str) -> NormalizedMetrics | None:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{TIKTOK_API}/video/query/",
                    json={"filters": {"video_ids": [post_id]}},
                    params={
                        "fields": "view_count,like_count,comment_count,share_count,favorite_count",
                    },
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                )

            if resp.status_code != 200:
                logger.warning("TikTok analytics error %d for video %s", resp.status_code, post_id)
                return None

            videos = resp.json().get("data", {}).get("videos", [])
            if not videos:
                logger.warning("TikTok video %s not found in response", post_id)
                return None

            video = videos[0]
            views = video.get("view_count", 0)
            likes = video.get("like_count", 0)
            comments = video.get("comment_count", 0)
            shares = video.get("share_count", 0)
            favorites = video.get("favorite_count", 0)

            engagements = likes + comments + shares + favorites
            engagement_rate = round(engagements / max(views, 1), 6)

            return NormalizedMetrics(
                impressions=views,
                engagements=engagements,
                engagement_rate=engagement_rate,
                saves_bookmarks=favorites,
                shares_reposts=shares,
                comments=comments,
                clicks=0,  # Not available in basic video query
                follows_gained=0,
                platform_specific={
                    "views": views,
                    "likes": likes,
                    "comments": comments,
                    "shares": shares,
                    "favorites": favorites,
                },
            )

        except Exception as exc:
            logger.warning("Failed to fetch TikTok metrics for video %s: %s", post_id, exc)
            return None
