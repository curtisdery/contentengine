"""TikTok — TikTok OAuth."""

import logging

import httpx

from app.services.platforms.base import BasePlatform

logger = logging.getLogger(__name__)


class TikTokPlatform(BasePlatform):
    platform_id = "tiktok"

    async def get_profile(self, access_token: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://open.tiktokapis.com/v2/user/info/",
                params={"fields": "open_id,union_id,display_name,avatar_url"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if resp.status_code != 200:
            logger.warning("TikTok profile fetch failed: %s", resp.text)
            return {}
        user = resp.json().get("data", {}).get("user", {})
        return {
            "platform_user_id": user.get("open_id") or user.get("union_id"),
            "platform_username": user.get("display_name"),
            "profile_image_url": user.get("avatar_url"),
        }
