"""Instagram fetcher — media insights via Graph API."""

import logging

import httpx

from app.services.fetchers.base import BaseFetcher, NormalizedMetrics

logger = logging.getLogger(__name__)

GRAPH_API = "https://graph.instagram.com/v21.0"


class InstagramFetcher(BaseFetcher):
    """Fetch Instagram media insights via Graph API.

    Requires a long-lived user token with instagram_manage_insights scope.
    Metric names differ for IMAGE/VIDEO/CAROUSEL_ALBUM media types.
    """

    platform_id = "instagram"

    async def fetch(self, token: str, post_id: str) -> NormalizedMetrics | None:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # Fetch basic engagement fields
                media_resp = await client.get(
                    f"{GRAPH_API}/{post_id}",
                    params={
                        "fields": "like_count,comments_count,media_type",
                        "access_token": token,
                    },
                )

            if media_resp.status_code != 200:
                logger.warning("Instagram media error %d for post %s", media_resp.status_code, post_id)
                return None

            media = media_resp.json()
            likes = media.get("like_count", 0)
            comments_count = media.get("comments_count", 0)
            media_type = media.get("media_type", "IMAGE")

            # Insights endpoint — metric names depend on media type
            metric_names = self._metrics_for_type(media_type)

            impressions = 0
            reach = 0
            saved = 0
            shares = 0

            async with httpx.AsyncClient(timeout=15) as client:
                insights_resp = await client.get(
                    f"{GRAPH_API}/{post_id}/insights",
                    params={
                        "metric": ",".join(metric_names),
                        "access_token": token,
                    },
                )

            if insights_resp.status_code == 200:
                for entry in insights_resp.json().get("data", []):
                    name = entry.get("name", "")
                    value = entry.get("values", [{}])[0].get("value", 0)
                    if name == "impressions":
                        impressions = value
                    elif name == "reach":
                        reach = value
                    elif name == "saved":
                        saved = value
                    elif name in ("shares", "video_views"):
                        shares = value

            engagements = likes + comments_count + saved + shares
            engagement_rate = round(engagements / max(impressions, 1), 6)

            return NormalizedMetrics(
                impressions=impressions,
                engagements=engagements,
                engagement_rate=engagement_rate,
                saves_bookmarks=saved,
                shares_reposts=shares,
                comments=comments_count,
                clicks=0,  # Not available per-media in basic insights
                follows_gained=0,
                platform_specific={
                    "likes": likes,
                    "comments": comments_count,
                    "saved": saved,
                    "shares": shares,
                    "reach": reach,
                    "media_type": media_type,
                },
            )

        except Exception as exc:
            logger.warning("Failed to fetch Instagram metrics for post %s: %s", post_id, exc)
            return None

    @staticmethod
    def _metrics_for_type(media_type: str) -> list[str]:
        """Return the insight metric names supported for a given media type."""
        if media_type == "VIDEO":
            return ["impressions", "reach", "saved", "video_views"]
        if media_type == "CAROUSEL_ALBUM":
            return ["impressions", "reach", "saved"]
        # IMAGE (default)
        return ["impressions", "reach", "saved", "shares"]
