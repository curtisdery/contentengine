"""YouTube — Google OAuth 2.0."""

import logging

import httpx

from app.services.platforms.base import BasePlatform

logger = logging.getLogger(__name__)


class YouTubePlatform(BasePlatform):
    platform_id = "youtube"

    async def get_profile(self, access_token: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params={"part": "snippet", "mine": "true"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if resp.status_code != 200:
            logger.warning("YouTube profile fetch failed: %s", resp.text)
            return {}
        items = resp.json().get("items", [])
        if not items:
            return {}
        channel = items[0]
        snippet = channel.get("snippet", {})
        return {
            "platform_user_id": channel.get("id"),
            "platform_username": snippet.get("title"),
            "profile_image_url": snippet.get("thumbnails", {}).get("default", {}).get("url"),
        }
