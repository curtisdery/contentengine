"""Twitter/X fetcher — tweet metrics via API v2."""

import logging

import httpx

from app.services.fetchers.base import BaseFetcher, NormalizedMetrics

logger = logging.getLogger(__name__)

API_BASE = "https://api.twitter.com/2"


class TwitterFetcher(BaseFetcher):
    """Fetch tweet engagement via public_metrics and non_public_metrics.

    Requires OAuth 2.0 user token with tweet.read scope.
    """

    platform_id = "twitter"

    async def fetch(self, token: str, post_id: str) -> NormalizedMetrics | None:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{API_BASE}/tweets/{post_id}",
                    params={"tweet.fields": "public_metrics,non_public_metrics"},
                    headers={"Authorization": f"Bearer {token}"},
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
            engagement_rate = round(engagements / max(impressions, 1), 6)

            return NormalizedMetrics(
                impressions=impressions,
                engagements=engagements,
                engagement_rate=engagement_rate,
                saves_bookmarks=bookmarks,
                shares_reposts=retweets + quotes,
                comments=replies,
                clicks=url_clicks + profile_clicks,
                follows_gained=0,
                platform_specific={
                    "likes": likes,
                    "retweets": retweets,
                    "replies": replies,
                    "quotes": quotes,
                    "bookmarks": bookmarks,
                    "url_clicks": url_clicks,
                    "profile_clicks": profile_clicks,
                },
            )

        except Exception as exc:
            logger.warning("Failed to fetch Twitter metrics for post %s: %s", post_id, exc)
            return None
