"""LinkedIn — OAuth 2.0."""

import logging

import httpx

from app.services.platforms.base import BasePlatform

logger = logging.getLogger(__name__)


class LinkedInPlatform(BasePlatform):
    platform_id = "linkedin"

    async def get_profile(self, access_token: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.linkedin.com/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if resp.status_code != 200:
            logger.warning("LinkedIn profile fetch failed: %s", resp.text)
            return {}
        data = resp.json()
        return {
            "platform_user_id": data.get("sub"),
            "platform_username": data.get("name"),
            "email": data.get("email"),
            "profile_image_url": data.get("picture"),
        }
