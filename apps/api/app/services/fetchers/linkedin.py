"""LinkedIn fetcher — post metrics via Marketing / Community Management API."""

import logging

import httpx

from app.services.fetchers.base import BaseFetcher, NormalizedMetrics

logger = logging.getLogger(__name__)


class LinkedInFetcher(BaseFetcher):
    """Fetch LinkedIn post engagement via shareStatistics and socialActions.

    Requires OAuth 2.0 token with r_organization_social or r_member_social scope.
    """

    platform_id = "linkedin"

    async def fetch(self, token: str, post_id: str) -> NormalizedMetrics | None:
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": "202401",
        }

        try:
            impressions = 0
            clicks = 0
            likes = 0
            comments = 0
            shares = 0

            async with httpx.AsyncClient(timeout=15) as client:
                # Primary: organizational share statistics
                stats_resp = await client.get(
                    "https://api.linkedin.com/rest/organizationalEntityShareStatistics",
                    params={
                        "q": "organizationalEntity",
                        "shares": f"List({post_id})",
                    },
                    headers=headers,
                )

                if stats_resp.status_code == 200:
                    elements = stats_resp.json().get("elements", [])
                    if elements:
                        stats = elements[0].get("totalShareStatistics", {})
                        impressions = stats.get("impressionCount", 0)
                        clicks = stats.get("clickCount", 0)
                        likes = stats.get("likeCount", 0)
                        comments = stats.get("commentCount", 0)
                        shares = stats.get("shareCount", 0)

                if not impressions and not likes:
                    # Fallback: social actions for basic engagement counts
                    actions_resp = await client.get(
                        f"https://api.linkedin.com/rest/socialActions/{post_id}",
                        headers=headers,
                    )
                    if actions_resp.status_code == 200:
                        data = actions_resp.json()
                        likes = data.get("likesSummary", {}).get("totalLikes", 0)
                        comments = data.get("commentsSummary", {}).get("totalFirstLevelComments", 0)

            engagements = likes + comments + shares + clicks
            engagement_rate = round(engagements / max(impressions, 1), 6)

            return NormalizedMetrics(
                impressions=impressions,
                engagements=engagements,
                engagement_rate=engagement_rate,
                saves_bookmarks=0,
                shares_reposts=shares,
                comments=comments,
                clicks=clicks,
                follows_gained=0,
                platform_specific={
                    "likes": likes,
                    "comments": comments,
                    "shares": shares,
                    "clicks": clicks,
                    "impressions": impressions,
                },
            )

        except Exception as exc:
            logger.warning("Failed to fetch LinkedIn metrics for post %s: %s", post_id, exc)
            return None
