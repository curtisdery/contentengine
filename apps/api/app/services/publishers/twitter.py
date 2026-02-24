"""Twitter/X publisher — single tweets and threads."""

import asyncio
import logging
from datetime import datetime, timezone

import httpx

from app.services.publishers.base import BasePublisher, PublishResult
from app.utils.exceptions import ValidationError

logger = logging.getLogger(__name__)

TWEET_MAX_LENGTH = 280
THREAD_DELAY_MS = 500
API_BASE = "https://api.twitter.com/2"


class TwitterPublisher(BasePublisher):
    platform_id = "twitter"

    def validate(self, output: dict) -> None:
        super().validate(output)
        content = output.get("content", "")
        # For threads, content is split by \n---\n
        parts = self._split_thread(content)
        for i, part in enumerate(parts):
            if len(part) > TWEET_MAX_LENGTH:
                raise ValidationError(
                    message="Tweet too long",
                    detail=f"Tweet {i + 1} is {len(part)} chars (max {TWEET_MAX_LENGTH}).",
                )

    async def publish(self, output: dict, token: str, **kwargs) -> PublishResult:
        content = output.get("content", "")
        parts = self._split_thread(content)

        if len(parts) == 1:
            return await self._publish_single(parts[0], token)
        else:
            return await self._publish_thread(parts, token)

    async def _publish_single(self, text: str, token: str) -> PublishResult:
        """Publish a single tweet."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{API_BASE}/tweets",
                json={"text": text},
                headers={"Authorization": f"Bearer {token}"},
            )

        if resp.status_code not in (200, 201):
            logger.error("Twitter publish failed: %s %s", resp.status_code, resp.text)
            return PublishResult(
                success=False,
                platform="twitter",
                error=f"Twitter API error: {resp.status_code}",
            )

        data = resp.json().get("data", {})
        tweet_id = data.get("id", "")
        return PublishResult(
            success=True,
            platform="twitter",
            platform_post_id=tweet_id,
            platform_post_url=f"https://twitter.com/i/status/{tweet_id}",
            published_at=datetime.now(timezone.utc),
        )

    async def _publish_thread(self, parts: list[str], token: str) -> PublishResult:
        """Publish a thread with 500ms delay between tweets."""
        first_tweet_id = None
        previous_id = None

        for i, text in enumerate(parts):
            payload: dict = {"text": text}
            if previous_id:
                payload["reply"] = {"in_reply_to_tweet_id": previous_id}

            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{API_BASE}/tweets",
                    json=payload,
                    headers={"Authorization": f"Bearer {token}"},
                )

            if resp.status_code not in (200, 201):
                logger.error("Twitter thread part %d failed: %s", i + 1, resp.text)
                return PublishResult(
                    success=False,
                    platform="twitter",
                    platform_post_id=first_tweet_id,
                    error=f"Thread failed at tweet {i + 1}: {resp.status_code}",
                )

            data = resp.json().get("data", {})
            tweet_id = data.get("id", "")
            if i == 0:
                first_tweet_id = tweet_id
            previous_id = tweet_id

            # Delay between tweets to avoid rate limits
            if i < len(parts) - 1:
                await asyncio.sleep(THREAD_DELAY_MS / 1000)

        return PublishResult(
            success=True,
            platform="twitter",
            platform_post_id=first_tweet_id,
            platform_post_url=f"https://twitter.com/i/status/{first_tweet_id}",
            published_at=datetime.now(timezone.utc),
            metadata={"thread_length": len(parts)},
        )

    @staticmethod
    def _split_thread(content: str) -> list[str]:
        """Split content into thread parts using --- separator."""
        if "\n---\n" in content:
            return [part.strip() for part in content.split("\n---\n") if part.strip()]
        return [content]
