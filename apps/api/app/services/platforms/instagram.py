"""Instagram — Meta OAuth, Graph API."""

import logging

import httpx

from app.services.platforms.base import BasePlatform

logger = logging.getLogger(__name__)


class InstagramPlatform(BasePlatform):
    platform_id = "instagram"

    async def get_profile(self, access_token: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://graph.instagram.com/me",
                params={"fields": "id,username", "access_token": access_token},
            )
        if resp.status_code != 200:
            logger.warning("Instagram profile fetch failed: %s", resp.text)
            return {}
        data = resp.json()
        return {
            "platform_user_id": data.get("id"),
            "platform_username": data.get("username"),
        }
