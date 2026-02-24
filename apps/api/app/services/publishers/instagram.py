"""Instagram publisher — two-step container → publish, carousel support."""

import asyncio
import logging
from datetime import datetime, timezone

import httpx

from app.services.publishers.base import BasePublisher, PublishResult
from app.utils.exceptions import ValidationError

logger = logging.getLogger(__name__)

GRAPH_API = "https://graph.instagram.com/v21.0"
INSTAGRAM_CAPTION_MAX = 2200
CONTAINER_POLL_INTERVAL = 2
CONTAINER_POLL_MAX = 30


class InstagramPublisher(BasePublisher):
    platform_id = "instagram"

    def validate(self, output: dict) -> None:
        content = output.get("content", "")
        media_urls = output.get("media_urls", [])
        if not media_urls:
            raise ValidationError(
                message="Media required",
                detail="Instagram requires at least one image or video.",
            )
        if len(content) > INSTAGRAM_CAPTION_MAX:
            raise ValidationError(
                message="Caption too long",
                detail=f"Caption is {len(content)} chars (max {INSTAGRAM_CAPTION_MAX}).",
            )

    async def publish(self, output: dict, token: str, **kwargs) -> PublishResult:
        platform_user_id = kwargs.get("platform_user_id", "")
        media_urls = output.get("media_urls", [])
        caption = output.get("content", "")

        if len(media_urls) > 1:
            return await self._publish_carousel(platform_user_id, media_urls, caption, token)
        return await self._publish_single(platform_user_id, media_urls[0], caption, token)

    async def _publish_single(
        self, ig_user_id: str, media_url: str, caption: str, token: str
    ) -> PublishResult:
        """Two-step: create media container, then publish."""
        async with httpx.AsyncClient(timeout=30) as client:
            # Step 1: Create container
            resp = await client.post(
                f"{GRAPH_API}/{ig_user_id}/media",
                params={
                    "image_url": media_url,
                    "caption": caption,
                    "access_token": token,
                },
            )

        if resp.status_code != 200:
            logger.error("Instagram container creation failed: %s", resp.text)
            return PublishResult(
                success=False, platform="instagram",
                error=f"Container creation failed: {resp.status_code}",
            )

        container_id = resp.json().get("id")
        await self._wait_for_container(container_id, token)

        # Step 2: Publish
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{GRAPH_API}/{ig_user_id}/media_publish",
                params={"creation_id": container_id, "access_token": token},
            )

        if resp.status_code != 200:
            logger.error("Instagram publish failed: %s", resp.text)
            return PublishResult(
                success=False, platform="instagram",
                error=f"Publish failed: {resp.status_code}",
            )

        post_id = resp.json().get("id", "")
        return PublishResult(
            success=True,
            platform="instagram",
            platform_post_id=post_id,
            platform_post_url=f"https://www.instagram.com/p/{post_id}/",
            published_at=datetime.now(timezone.utc),
        )

    async def _publish_carousel(
        self, ig_user_id: str, media_urls: list[str], caption: str, token: str
    ) -> PublishResult:
        """Create multiple containers, then a carousel container, then publish."""
        children_ids = []

        for url in media_urls[:10]:  # Instagram max 10 items
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{GRAPH_API}/{ig_user_id}/media",
                    params={
                        "image_url": url,
                        "is_carousel_item": "true",
                        "access_token": token,
                    },
                )
            if resp.status_code != 200:
                logger.error("Instagram carousel child failed: %s", resp.text)
                return PublishResult(
                    success=False, platform="instagram",
                    error=f"Carousel child creation failed: {resp.status_code}",
                )
            children_ids.append(resp.json().get("id"))

        # Create carousel container
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{GRAPH_API}/{ig_user_id}/media",
                params={
                    "media_type": "CAROUSEL",
                    "caption": caption,
                    "children": ",".join(children_ids),
                    "access_token": token,
                },
            )

        if resp.status_code != 200:
            logger.error("Instagram carousel container failed: %s", resp.text)
            return PublishResult(
                success=False, platform="instagram",
                error=f"Carousel container failed: {resp.status_code}",
            )

        container_id = resp.json().get("id")
        await self._wait_for_container(container_id, token)

        # Publish carousel
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{GRAPH_API}/{ig_user_id}/media_publish",
                params={"creation_id": container_id, "access_token": token},
            )

        if resp.status_code != 200:
            return PublishResult(
                success=False, platform="instagram",
                error=f"Carousel publish failed: {resp.status_code}",
            )

        post_id = resp.json().get("id", "")
        return PublishResult(
            success=True,
            platform="instagram",
            platform_post_id=post_id,
            platform_post_url=f"https://www.instagram.com/p/{post_id}/",
            published_at=datetime.now(timezone.utc),
            metadata={"carousel_items": len(children_ids)},
        )

    async def _wait_for_container(self, container_id: str, token: str) -> None:
        """Poll container status until FINISHED or timeout."""
        for _ in range(CONTAINER_POLL_MAX):
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{GRAPH_API}/{container_id}",
                    params={"fields": "status_code", "access_token": token},
                )
            if resp.status_code == 200:
                status = resp.json().get("status_code")
                if status == "FINISHED":
                    return
                if status == "ERROR":
                    raise ValidationError(
                        message="Container error",
                        detail="Instagram media container processing failed.",
                    )
            await asyncio.sleep(CONTAINER_POLL_INTERVAL)
