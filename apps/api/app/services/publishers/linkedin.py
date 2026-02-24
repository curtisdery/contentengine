"""LinkedIn publisher — UGC posts and articles."""

import logging
from datetime import datetime, timezone

import httpx

from app.services.publishers.base import BasePublisher, PublishResult
from app.utils.exceptions import ValidationError

logger = logging.getLogger(__name__)

API_BASE = "https://api.linkedin.com/v2"
LINKEDIN_POST_MAX_LENGTH = 3000


class LinkedInPublisher(BasePublisher):
    platform_id = "linkedin"

    def validate(self, output: dict) -> None:
        super().validate(output)
        content = output.get("content", "")
        if len(content) > LINKEDIN_POST_MAX_LENGTH:
            raise ValidationError(
                message="Post too long",
                detail=f"LinkedIn post is {len(content)} chars (max {LINKEDIN_POST_MAX_LENGTH}).",
            )

    async def publish(self, output: dict, token: str, **kwargs) -> PublishResult:
        content = output.get("content", "")
        platform_user_id = kwargs.get("platform_user_id", "")
        format_type = output.get("format_type", "post")

        if format_type == "article":
            return await self._publish_article(content, token, platform_user_id, output)
        return await self._publish_ugc_post(content, token, platform_user_id)

    async def _publish_ugc_post(
        self, text: str, token: str, person_urn: str
    ) -> PublishResult:
        """Publish a standard UGC post."""
        author = f"urn:li:person:{person_urn}"
        payload = {
            "author": author,
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {"text": text},
                    "shareMediaCategory": "NONE",
                }
            },
            "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{API_BASE}/ugcPosts",
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Restli-Protocol-Version": "2.0.0",
                },
            )

        if resp.status_code not in (200, 201):
            logger.error("LinkedIn UGC post failed: %s %s", resp.status_code, resp.text)
            return PublishResult(
                success=False,
                platform="linkedin",
                error=f"LinkedIn API error: {resp.status_code}",
            )

        post_id = resp.json().get("id", "")
        return PublishResult(
            success=True,
            platform="linkedin",
            platform_post_id=post_id,
            platform_post_url=f"https://www.linkedin.com/feed/update/{post_id}",
            published_at=datetime.now(timezone.utc),
        )

    async def _publish_article(
        self, text: str, token: str, person_urn: str, output: dict
    ) -> PublishResult:
        """Publish a LinkedIn article (long-form post with title)."""
        author = f"urn:li:person:{person_urn}"
        title = output.get("title", "")

        payload = {
            "author": author,
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {"text": text},
                    "shareMediaCategory": "ARTICLE",
                    "media": [{
                        "status": "READY",
                        "description": {"text": title},
                        "title": {"text": title},
                    }],
                }
            },
            "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{API_BASE}/ugcPosts",
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Restli-Protocol-Version": "2.0.0",
                },
            )

        if resp.status_code not in (200, 201):
            logger.error("LinkedIn article failed: %s %s", resp.status_code, resp.text)
            return PublishResult(
                success=False,
                platform="linkedin",
                error=f"LinkedIn API error: {resp.status_code}",
            )

        post_id = resp.json().get("id", "")
        return PublishResult(
            success=True,
            platform="linkedin",
            platform_post_id=post_id,
            platform_post_url=f"https://www.linkedin.com/feed/update/{post_id}",
            published_at=datetime.now(timezone.utc),
            metadata={"format": "article"},
        )
