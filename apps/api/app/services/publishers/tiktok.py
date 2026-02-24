"""TikTok publisher — Content Posting API (direct post)."""

import logging
from datetime import datetime, timezone

import httpx

from app.services.publishers.base import BasePublisher, PublishResult
from app.utils.exceptions import ValidationError

logger = logging.getLogger(__name__)

TIKTOK_API = "https://open.tiktokapis.com/v2"
TIKTOK_DESCRIPTION_MAX = 2200


class TikTokPublisher(BasePublisher):
    platform_id = "tiktok"

    def validate(self, output: dict) -> None:
        media_urls = output.get("media_urls", [])
        if not media_urls:
            raise ValidationError(
                message="Video required",
                detail="TikTok requires a video file.",
            )
        content = output.get("content", "")
        if len(content) > TIKTOK_DESCRIPTION_MAX:
            raise ValidationError(
                message="Description too long",
                detail=f"Description is {len(content)} chars (max {TIKTOK_DESCRIPTION_MAX}).",
            )

    async def publish(self, output: dict, token: str, **kwargs) -> PublishResult:
        description = output.get("content", "")
        video_url = output.get("media_urls", [""])[0]

        # Step 1: Initialize upload via Content Posting API
        init_payload = {
            "post_info": {
                "title": description[:150],
                "description": description,
                "privacy_level": "PUBLIC_TO_EVERYONE",
                "disable_duet": False,
                "disable_stitch": False,
                "disable_comment": False,
            },
            "source_info": {
                "source": "PULL_FROM_URL",
                "video_url": video_url,
            },
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{TIKTOK_API}/post/publish/video/init/",
                json=init_payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json; charset=UTF-8",
                },
            )

        if resp.status_code != 200:
            logger.error("TikTok publish init failed: %s %s", resp.status_code, resp.text)
            return PublishResult(
                success=False, platform="tiktok",
                error=f"TikTok API error: {resp.status_code}",
            )

        data = resp.json().get("data", {})
        publish_id = data.get("publish_id", "")

        if not publish_id:
            error_msg = resp.json().get("error", {}).get("message", "Unknown error")
            return PublishResult(
                success=False, platform="tiktok",
                error=f"TikTok publish failed: {error_msg}",
            )

        # Step 2: Check publish status
        status_result = await self._check_publish_status(publish_id, token)

        return PublishResult(
            success=True,
            platform="tiktok",
            platform_post_id=publish_id,
            published_at=datetime.now(timezone.utc),
            metadata={"publish_id": publish_id, "status": status_result},
        )

    async def _check_publish_status(self, publish_id: str, token: str) -> str:
        """Check the status of a TikTok publish operation."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{TIKTOK_API}/post/publish/status/fetch/",
                json={"publish_id": publish_id},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )

        if resp.status_code == 200:
            return resp.json().get("data", {}).get("status", "processing")
        return "unknown"
