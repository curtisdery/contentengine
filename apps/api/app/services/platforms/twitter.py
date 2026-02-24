"""Twitter/X — OAuth 2.0 with PKCE."""

import logging

import httpx

from app.services.platforms.base import BasePlatform

logger = logging.getLogger(__name__)


class TwitterPlatform(BasePlatform):
    platform_id = "twitter"

    async def get_profile(self, access_token: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.twitter.com/2/users/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if resp.status_code != 200:
            logger.warning("Twitter profile fetch failed: %s", resp.text)
            return {}
        data = resp.json().get("data", {})
        return {
            "platform_user_id": data.get("id"),
            "platform_username": data.get("username"),
            "display_name": data.get("name"),
            "profile_image_url": data.get("profile_image_url"),
        }
