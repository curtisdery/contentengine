"""YouTube publisher — Shorts upload via resumable upload API."""

import logging
from datetime import datetime, timezone

import httpx

from app.services.publishers.base import BasePublisher, PublishResult
from app.utils.exceptions import ValidationError

logger = logging.getLogger(__name__)

UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3/videos"
YOUTUBE_TITLE_MAX = 100
YOUTUBE_DESCRIPTION_MAX = 5000


class YouTubePublisher(BasePublisher):
    platform_id = "youtube"

    def validate(self, output: dict) -> None:
        media_urls = output.get("media_urls", [])
        if not media_urls:
            raise ValidationError(
                message="Video required",
                detail="YouTube Shorts requires a video file.",
            )
        title = output.get("title", "")
        if len(title) > YOUTUBE_TITLE_MAX:
            raise ValidationError(
                message="Title too long",
                detail=f"Title is {len(title)} chars (max {YOUTUBE_TITLE_MAX}).",
            )

    async def publish(self, output: dict, token: str, **kwargs) -> PublishResult:
        title = output.get("title", "Untitled Short")
        description = output.get("content", "")[:YOUTUBE_DESCRIPTION_MAX]
        video_url = output.get("media_urls", [""])[0]
        tags = output.get("tags", [])

        # Step 1: Download video from storage URL
        async with httpx.AsyncClient(timeout=60) as client:
            video_resp = await client.get(video_url)
        if video_resp.status_code != 200:
            return PublishResult(
                success=False, platform="youtube",
                error="Failed to download video from storage.",
            )
        video_bytes = video_resp.content

        # Step 2: Initiate resumable upload
        metadata = {
            "snippet": {
                "title": title,
                "description": description,
                "tags": tags,
                "categoryId": "22",  # People & Blogs
            },
            "status": {
                "privacyStatus": "public",
                "selfDeclaredMadeForKids": False,
                "madeForKids": False,
            },
        }

        async with httpx.AsyncClient(timeout=30) as client:
            init_resp = await client.post(
                UPLOAD_API,
                params={"uploadType": "resumable", "part": "snippet,status"},
                json=metadata,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json; charset=UTF-8",
                    "X-Upload-Content-Type": "video/*",
                    "X-Upload-Content-Length": str(len(video_bytes)),
                },
            )

        if init_resp.status_code != 200:
            logger.error("YouTube upload init failed: %s %s", init_resp.status_code, init_resp.text)
            return PublishResult(
                success=False, platform="youtube",
                error=f"Upload init failed: {init_resp.status_code}",
            )

        upload_url = init_resp.headers.get("location", "")
        if not upload_url:
            return PublishResult(
                success=False, platform="youtube",
                error="No upload URL returned from YouTube.",
            )

        # Step 3: Upload video bytes
        async with httpx.AsyncClient(timeout=300) as client:
            upload_resp = await client.put(
                upload_url,
                content=video_bytes,
                headers={"Content-Type": "video/*"},
            )

        if upload_resp.status_code not in (200, 201):
            logger.error("YouTube upload failed: %s %s", upload_resp.status_code, upload_resp.text)
            return PublishResult(
                success=False, platform="youtube",
                error=f"Upload failed: {upload_resp.status_code}",
            )

        data = upload_resp.json()
        video_id = data.get("id", "")
        return PublishResult(
            success=True,
            platform="youtube",
            platform_post_id=video_id,
            platform_post_url=f"https://youtube.com/shorts/{video_id}",
            published_at=datetime.now(timezone.utc),
            metadata={"format": "shorts"},
        )
