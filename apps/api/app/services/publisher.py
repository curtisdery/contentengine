"""Platform publishing service — abstract base and real implementations.

Defines the BasePlatformPublisher interface and provides implementations
for Twitter/X (API v2), LinkedIn (Marketing API), and Bluesky (AT Protocol).
Remaining platforms retain stub implementations until Sprint 10+.
"""

import asyncio
import logging
import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone

import httpx

from app.config import get_settings
from app.models.platform_connection import PlatformConnection
from app.services.platform_connection import PlatformConnectionService

logger = logging.getLogger(__name__)
connection_service = PlatformConnectionService()


class BasePlatformPublisher(ABC):
    """Abstract base class for platform publishers."""

    @abstractmethod
    async def publish(
        self,
        content: str,
        metadata: dict,
        connection: PlatformConnection,
    ) -> dict:
        """Publish content to the platform.

        Returns:
            {
                "success": bool,
                "post_id": str | None,
                "url": str | None,
                "error": str | None,
            }
        """

    @abstractmethod
    async def validate_connection(self, connection: PlatformConnection) -> bool:
        """Check if the platform connection is still valid (token not expired, etc.)."""

    @abstractmethod
    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        """Refresh an expired OAuth token. Returns the updated connection."""


# ---------------------------------------------------------------------------
# Twitter/X — Real Implementation (API v2)
# ---------------------------------------------------------------------------


class TwitterPublisher(BasePlatformPublisher):
    """Twitter/X API v2 publisher.

    Supports single tweets and threads. Uses OAuth 2.0 with PKCE tokens
    stored encrypted in PlatformConnection.
    """

    TWEETS_URL = "https://api.twitter.com/2/tweets"
    TOKEN_URL = "https://api.twitter.com/2/oauth2/token"

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        tokens = connection_service.get_decrypted_tokens(connection)
        access_token = tokens.get("access_token")
        if not access_token:
            return {"success": False, "post_id": None, "url": None, "error": "No access token found for Twitter connection."}

        format_type = metadata.get("format_type", "twitter_single")

        try:
            if format_type == "twitter_thread":
                return await self._publish_thread(content, access_token, connection)
            else:
                return await self._publish_single(content, access_token)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                # Try token refresh and retry once
                try:
                    connection = await self.refresh_token(connection)
                    tokens = connection_service.get_decrypted_tokens(connection)
                    access_token = tokens["access_token"]
                    if format_type == "twitter_thread":
                        return await self._publish_thread(content, access_token, connection)
                    else:
                        return await self._publish_single(content, access_token)
                except Exception as refresh_err:
                    return {"success": False, "post_id": None, "url": None, "error": f"Token refresh failed: {refresh_err}"}
            elif e.response.status_code == 429:
                return await self._handle_rate_limit(e, content, metadata, connection)
            else:
                body = e.response.text
                return {"success": False, "post_id": None, "url": None, "error": f"Twitter API error {e.response.status_code}: {body}"}
        except Exception as e:
            return {"success": False, "post_id": None, "url": None, "error": f"Twitter publish error: {e}"}

    async def _publish_single(self, content: str, access_token: str) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                self.TWEETS_URL,
                json={"text": content},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            data = resp.json()
            tweet_id = data["data"]["id"]
            url = f"https://x.com/i/status/{tweet_id}"
            logger.info("Published tweet %s", tweet_id)
            return {"success": True, "post_id": tweet_id, "url": url, "error": None}

    async def _publish_thread(self, content: str, access_token: str, connection: PlatformConnection) -> dict:
        # Split content into thread parts: numbered markers (1/, 2/) or double newlines
        parts = re.split(r'\n\s*\d+/\s*\n?|\n\n+', content.strip())
        parts = [p.strip() for p in parts if p.strip()]

        if len(parts) < 2:
            # Fallback to single tweet if can't split
            return await self._publish_single(content, access_token)

        first_tweet_id = None
        previous_tweet_id = None

        async with httpx.AsyncClient(timeout=30) as client:
            for i, part in enumerate(parts):
                payload: dict = {"text": part}
                if previous_tweet_id:
                    payload["reply"] = {"in_reply_to_tweet_id": previous_tweet_id}

                resp = await client.post(
                    self.TWEETS_URL,
                    json=payload,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                resp.raise_for_status()
                data = resp.json()
                tweet_id = data["data"]["id"]

                if i == 0:
                    first_tweet_id = tweet_id
                previous_tweet_id = tweet_id

                # Small delay between thread tweets to avoid rate limits
                if i < len(parts) - 1:
                    await asyncio.sleep(1)

        logger.info("Published Twitter thread starting at %s (%d tweets)", first_tweet_id, len(parts))
        url = f"https://x.com/i/status/{first_tweet_id}"
        return {"success": True, "post_id": first_tweet_id, "url": url, "error": None}

    async def _handle_rate_limit(self, error: httpx.HTTPStatusError, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        """Handle 429 rate limit with exponential backoff (up to 2 retries)."""
        retry_after = int(error.response.headers.get("retry-after", "60"))
        for attempt in range(2):
            wait_time = min(retry_after * (2 ** attempt), 300)
            logger.warning("Twitter rate limited. Waiting %ds (attempt %d/2)", wait_time, attempt + 1)
            await asyncio.sleep(wait_time)
            try:
                tokens = connection_service.get_decrypted_tokens(connection)
                format_type = metadata.get("format_type", "twitter_single")
                if format_type == "twitter_thread":
                    return await self._publish_thread(content, tokens["access_token"], connection)
                else:
                    return await self._publish_single(content, tokens["access_token"])
            except httpx.HTTPStatusError as e:
                if e.response.status_code != 429:
                    return {"success": False, "post_id": None, "url": None, "error": f"Twitter API error {e.response.status_code}: {e.response.text}"}
                continue
        return {"success": False, "post_id": None, "url": None, "error": "Twitter rate limit exceeded after retries."}

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        if connection.token_expires_at:
            expires = connection.token_expires_at
            if expires.tzinfo is None:
                return expires > datetime.utcnow()
            return expires > datetime.now(timezone.utc)
        # No expiry set — assume valid and let publish attempt verify
        return True

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        settings = get_settings()
        tokens = connection_service.get_decrypted_tokens(connection)
        refresh_tok = tokens.get("refresh_token")
        if not refresh_tok:
            raise ValueError("No refresh token available for Twitter connection")

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                self.TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_tok,
                    "client_id": settings.TWITTER_CLIENT_ID,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            data = resp.json()

        new_access = data["access_token"]
        new_refresh = data.get("refresh_token", refresh_tok)
        expires_in = data.get("expires_in", 7200)

        from datetime import timedelta
        from app.utils.encryption import encrypt_token
        connection.access_token_encrypted = encrypt_token(new_access)
        connection.refresh_token_encrypted = encrypt_token(new_refresh)
        connection.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        logger.info("Refreshed Twitter token for connection %s", connection.id)
        return connection


# ---------------------------------------------------------------------------
# LinkedIn — Real Implementation (Marketing API)
# ---------------------------------------------------------------------------


class LinkedInPublisher(BasePlatformPublisher):
    """LinkedIn Marketing API publisher.

    Supports posts and articles. Uses OAuth 2.0 tokens stored encrypted
    in PlatformConnection.
    """

    POSTS_URL = "https://api.linkedin.com/rest/posts"
    TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        tokens = connection_service.get_decrypted_tokens(connection)
        access_token = tokens.get("access_token")
        if not access_token:
            return {"success": False, "post_id": None, "url": None, "error": "No access token found for LinkedIn connection."}

        user_id = connection.platform_user_id
        if not user_id:
            return {"success": False, "post_id": None, "url": None, "error": "No LinkedIn user ID found. Reconnect your LinkedIn account."}

        format_type = metadata.get("format_type", "linkedin_post")

        try:
            if format_type == "linkedin_article":
                return await self._publish_article(content, metadata, access_token, user_id)
            else:
                return await self._publish_post(content, access_token, user_id)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                try:
                    connection = await self.refresh_token(connection)
                    tokens = connection_service.get_decrypted_tokens(connection)
                    access_token = tokens["access_token"]
                    if format_type == "linkedin_article":
                        return await self._publish_article(content, metadata, access_token, user_id)
                    else:
                        return await self._publish_post(content, access_token, user_id)
                except Exception as refresh_err:
                    return {"success": False, "post_id": None, "url": None, "error": f"Token refresh failed: {refresh_err}"}
            elif e.response.status_code == 429:
                return {"success": False, "post_id": None, "url": None, "error": "LinkedIn rate limit exceeded. Try again later."}
            else:
                body = e.response.text
                return {"success": False, "post_id": None, "url": None, "error": f"LinkedIn API error {e.response.status_code}: {body}"}
        except Exception as e:
            return {"success": False, "post_id": None, "url": None, "error": f"LinkedIn publish error: {e}"}

    async def _publish_post(self, content: str, access_token: str, user_id: str) -> dict:
        author = f"urn:li:person:{user_id}"
        payload = {
            "author": author,
            "commentary": content,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "lifecycleState": "PUBLISHED",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                self.POSTS_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "X-Restli-Protocol-Version": "2.0.0",
                    "LinkedIn-Version": "202401",
                },
            )
            resp.raise_for_status()

            # LinkedIn returns the post URN in the x-restli-id header
            post_urn = resp.headers.get("x-restli-id", "")
            post_id = post_urn.split(":")[-1] if post_urn else ""

            url = f"https://www.linkedin.com/feed/update/{post_urn}" if post_urn else None
            logger.info("Published LinkedIn post %s", post_urn)
            return {"success": True, "post_id": post_urn or post_id, "url": url, "error": None}

    async def _publish_article(self, content: str, metadata: dict, access_token: str, user_id: str) -> dict:
        """Publish a LinkedIn article (with title and description)."""
        author = f"urn:li:person:{user_id}"
        title = metadata.get("title", "")
        source_url = metadata.get("source_url", "")

        # Articles are published as posts with article content
        payload = {
            "author": author,
            "commentary": content,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "lifecycleState": "PUBLISHED",
        }

        # If there's a source URL, attach it as article content
        if source_url:
            payload["content"] = {
                "article": {
                    "source": source_url,
                    "title": title or "Article",
                    "description": content[:200] if len(content) > 200 else content,
                },
            }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                self.POSTS_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "X-Restli-Protocol-Version": "2.0.0",
                    "LinkedIn-Version": "202401",
                },
            )
            resp.raise_for_status()

            post_urn = resp.headers.get("x-restli-id", "")
            url = f"https://www.linkedin.com/feed/update/{post_urn}" if post_urn else None
            logger.info("Published LinkedIn article %s", post_urn)
            return {"success": True, "post_id": post_urn, "url": url, "error": None}

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        if connection.token_expires_at:
            expires = connection.token_expires_at
            if expires.tzinfo is None:
                return expires > datetime.utcnow()
            return expires > datetime.now(timezone.utc)
        return True

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        settings = get_settings()
        tokens = connection_service.get_decrypted_tokens(connection)
        refresh_tok = tokens.get("refresh_token")
        if not refresh_tok:
            raise ValueError("No refresh token available for LinkedIn connection")

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                self.TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_tok,
                    "client_id": settings.LINKEDIN_CLIENT_ID,
                    "client_secret": settings.LINKEDIN_CLIENT_SECRET,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            data = resp.json()

        new_access = data["access_token"]
        new_refresh = data.get("refresh_token", refresh_tok)
        expires_in = data.get("expires_in", 5184000)  # LinkedIn tokens last ~60 days

        from datetime import timedelta
        from app.utils.encryption import encrypt_token
        connection.access_token_encrypted = encrypt_token(new_access)
        connection.refresh_token_encrypted = encrypt_token(new_refresh)
        connection.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        logger.info("Refreshed LinkedIn token for connection %s", connection.id)
        return connection


# ---------------------------------------------------------------------------
# Bluesky — Real Implementation (AT Protocol)
# ---------------------------------------------------------------------------


class BlueskyPublisher(BasePlatformPublisher):
    """Bluesky AT Protocol publisher.

    Uses app password authentication stored in PlatformConnection.
    Creates a new session for each publish operation (sessions are short-lived).
    """

    PDS_URL = "https://bsky.social/xrpc"

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        tokens = connection_service.get_decrypted_tokens(connection)
        app_password = tokens.get("access_token")  # App password stored as access_token
        handle = connection.platform_username
        did = connection.platform_user_id

        if not app_password or not (handle or did):
            return {"success": False, "post_id": None, "url": None, "error": "Missing Bluesky credentials. Reconnect your account."}

        try:
            # Create session
            session = await self._create_session(handle or did, app_password)
            if not session:
                return {"success": False, "post_id": None, "url": None, "error": "Failed to authenticate with Bluesky. Check your app password."}

            access_jwt = session["accessJwt"]
            session_did = session["did"]

            # Parse facets for rich text (links, mentions, hashtags)
            facets = self._parse_facets(content)

            # Create post record
            now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            record: dict = {
                "text": content,
                "createdAt": now,
            }
            if facets:
                record["facets"] = facets

            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self.PDS_URL}/com.atproto.repo.createRecord",
                    json={
                        "repo": session_did,
                        "collection": "app.bsky.feed.post",
                        "record": record,
                    },
                    headers={"Authorization": f"Bearer {access_jwt}"},
                )
                resp.raise_for_status()
                data = resp.json()

            uri = data.get("uri", "")
            cid = data.get("cid", "")

            # Build bsky.app URL: at://did/app.bsky.feed.post/rkey -> bsky.app/profile/handle/post/rkey
            rkey = uri.split("/")[-1] if uri else ""
            bsky_url = f"https://bsky.app/profile/{handle or session_did}/post/{rkey}" if rkey else None

            logger.info("Published Bluesky post %s", uri)
            return {"success": True, "post_id": uri, "url": bsky_url, "error": None}

        except httpx.HTTPStatusError as e:
            body = e.response.text
            return {"success": False, "post_id": None, "url": None, "error": f"Bluesky API error {e.response.status_code}: {body}"}
        except Exception as e:
            return {"success": False, "post_id": None, "url": None, "error": f"Bluesky publish error: {e}"}

    async def _create_session(self, identifier: str, password: str) -> dict | None:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.PDS_URL}/com.atproto.server.createSession",
                json={"identifier": identifier, "password": password},
            )
            if resp.status_code != 200:
                logger.warning("Bluesky session creation failed: %s", resp.text)
                return None
            return resp.json()

    @staticmethod
    def _parse_facets(text: str) -> list[dict]:
        """Parse links, mentions, and hashtags into Bluesky facets for rich text."""
        facets = []
        text_bytes = text.encode("utf-8")

        # URLs
        url_pattern = re.compile(r'https?://[^\s\)\]]+')
        for match in url_pattern.finditer(text):
            url = match.group(0)
            # Remove trailing punctuation that's likely not part of the URL
            while url and url[-1] in ".,;:!?)":
                url = url[:-1]
            start = text_bytes.find(url.encode("utf-8"))
            if start >= 0:
                facets.append({
                    "index": {"byteStart": start, "byteEnd": start + len(url.encode("utf-8"))},
                    "features": [{"$type": "app.bsky.richtext.facet#link", "uri": url}],
                })

        # Mentions (@handle.bsky.social)
        mention_pattern = re.compile(r'@([\w.-]+\.[\w.-]+)')
        for match in mention_pattern.finditer(text):
            handle = match.group(1)
            mention_text = match.group(0)
            start = text_bytes.find(mention_text.encode("utf-8"))
            if start >= 0:
                facets.append({
                    "index": {"byteStart": start, "byteEnd": start + len(mention_text.encode("utf-8"))},
                    "features": [{"$type": "app.bsky.richtext.facet#mention", "did": handle}],
                })

        # Hashtags (#tag)
        hashtag_pattern = re.compile(r'#(\w+)')
        for match in hashtag_pattern.finditer(text):
            tag = match.group(0)
            start = text_bytes.find(tag.encode("utf-8"))
            if start >= 0:
                facets.append({
                    "index": {"byteStart": start, "byteEnd": start + len(tag.encode("utf-8"))},
                    "features": [{"$type": "app.bsky.richtext.facet#tag", "tag": match.group(1)}],
                })

        return facets

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        """Bluesky app passwords don't expire, so always valid if credentials exist."""
        tokens = connection_service.get_decrypted_tokens(connection)
        return bool(tokens.get("access_token")) and bool(connection.platform_username or connection.platform_user_id)

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        """Bluesky uses app passwords, no refresh needed."""
        return connection


# ---------------------------------------------------------------------------
# Stub implementations — Sprint 10+
# Each returns a "not yet implemented" response with a helpful message.
# ---------------------------------------------------------------------------


class InstagramPublisher(BasePlatformPublisher):
    """Instagram Graph API publisher. Stub for Sprint 10+."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("InstagramPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "Instagram publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class YouTubePublisher(BasePlatformPublisher):
    """YouTube Data API v3 publisher. Stub for Sprint 10+."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("YouTubePublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "YouTube publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class TikTokPublisher(BasePlatformPublisher):
    """TikTok Content Posting API publisher. Stub for Sprint 10+."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("TikTokPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "TikTok publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class PinterestPublisher(BasePlatformPublisher):
    """Pinterest API v5 publisher. Stub for Sprint 10+."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("PinterestPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "Pinterest publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class RedditPublisher(BasePlatformPublisher):
    """Reddit API publisher. Stub for Sprint 10+."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("RedditPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "Reddit publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class MediumPublisher(BasePlatformPublisher):
    """Medium API publisher. Stub for Sprint 10+."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("MediumPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "Medium publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


class QuoraPublisher(BasePlatformPublisher):
    """Quora publisher. Stub for Sprint 10+."""

    async def publish(self, content: str, metadata: dict, connection: PlatformConnection) -> dict:
        logger.info("QuoraPublisher.publish called (stub) — content length: %d", len(content))
        return {
            "success": False,
            "post_id": None,
            "url": None,
            "error": "Quora publishing not yet implemented. Copy content from dashboard.",
        }

    async def validate_connection(self, connection: PlatformConnection) -> bool:
        return False

    async def refresh_token(self, connection: PlatformConnection) -> PlatformConnection:
        return connection


# ---------------------------------------------------------------------------
# Publisher Registry
# ---------------------------------------------------------------------------


class PublisherRegistry:
    """Registry mapping platform_id to publisher implementations."""

    _publishers: dict[str, BasePlatformPublisher] = {}

    @classmethod
    def register(cls, platform_id: str, publisher: BasePlatformPublisher) -> None:
        cls._publishers[platform_id] = publisher

    @classmethod
    def get(cls, platform_id: str) -> BasePlatformPublisher | None:
        return cls._publishers.get(platform_id)

    @classmethod
    def is_supported(cls, platform_id: str) -> bool:
        return platform_id in cls._publishers

    @classmethod
    def get_supported_platforms(cls) -> list[str]:
        return list(cls._publishers.keys())


def init_publishers() -> None:
    """Register all platform publisher implementations.

    Called at application startup to populate the PublisherRegistry.
    """
    _twitter = TwitterPublisher()
    _linkedin = LinkedInPublisher()
    _instagram = InstagramPublisher()
    _youtube = YouTubePublisher()
    _tiktok = TikTokPublisher()
    _bluesky = BlueskyPublisher()
    _pinterest = PinterestPublisher()
    _reddit = RedditPublisher()
    _medium = MediumPublisher()
    _quora = QuoraPublisher()

    # Tier 1 — Primary text-first social
    PublisherRegistry.register("twitter_single", _twitter)
    PublisherRegistry.register("twitter_thread", _twitter)
    PublisherRegistry.register("linkedin_post", _linkedin)
    PublisherRegistry.register("linkedin_article", _linkedin)
    PublisherRegistry.register("bluesky_post", _bluesky)

    # Tier 2 — Visual-first and discovery
    PublisherRegistry.register("instagram_carousel", _instagram)
    PublisherRegistry.register("instagram_caption", _instagram)
    PublisherRegistry.register("pinterest_pin", _pinterest)

    # Tier 3 — Long-form written
    PublisherRegistry.register("medium_post", _medium)

    # Tier 4 — Video and audio
    PublisherRegistry.register("youtube_longform", _youtube)
    PublisherRegistry.register("short_form_video", _tiktok)

    # Tier 5 — Community and Q&A
    PublisherRegistry.register("reddit_post", _reddit)
    PublisherRegistry.register("quora_answer", _quora)

    logger.info(
        "Initialized %d platform publishers: %s",
        len(PublisherRegistry.get_supported_platforms()),
        ", ".join(PublisherRegistry.get_supported_platforms()),
    )
