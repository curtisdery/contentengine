"""OAuth configuration registry for all supported platforms."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class AuthMethod(str, Enum):
    OAUTH2 = "oauth2"
    APP_PASSWORD = "app_password"
    NONE = "none"


class TokenAuthMethod(str, Enum):
    POST_BODY = "post_body"
    BASIC_AUTH = "basic_auth"


@dataclass(frozen=True)
class OAuthPlatformConfig:
    platform_id: str
    auth_method: AuthMethod
    authorize_url: str = ""
    token_url: str = ""
    userinfo_url: str = ""
    scopes: list[str] = field(default_factory=list)
    client_id_env: str = ""
    client_secret_env: str = ""
    uses_pkce: bool = False
    token_auth_method: TokenAuthMethod = TokenAuthMethod.POST_BODY
    extra_authorize_params: dict[str, str] = field(default_factory=dict)
    extra_token_params: dict[str, str] = field(default_factory=dict)


OAUTH_CONFIGS: dict[str, OAuthPlatformConfig] = {
    # ------------------------------------------------------------------
    # OAuth 2.0 platforms
    # ------------------------------------------------------------------
    "twitter": OAuthPlatformConfig(
        platform_id="twitter",
        auth_method=AuthMethod.OAUTH2,
        authorize_url="https://twitter.com/i/oauth2/authorize",
        token_url="https://api.twitter.com/2/oauth2/token",
        userinfo_url="https://api.twitter.com/2/users/me",
        scopes=["tweet.read", "tweet.write", "users.read", "offline.access"],
        client_id_env="TWITTER_CLIENT_ID",
        client_secret_env="TWITTER_CLIENT_SECRET",
        uses_pkce=True,
    ),
    "linkedin": OAuthPlatformConfig(
        platform_id="linkedin",
        auth_method=AuthMethod.OAUTH2,
        authorize_url="https://www.linkedin.com/oauth/v2/authorization",
        token_url="https://www.linkedin.com/oauth/v2/accessToken",
        userinfo_url="https://api.linkedin.com/v2/userinfo",
        scopes=["w_member_social", "r_liteprofile"],
        client_id_env="LINKEDIN_CLIENT_ID",
        client_secret_env="LINKEDIN_CLIENT_SECRET",
    ),
    "instagram": OAuthPlatformConfig(
        platform_id="instagram",
        auth_method=AuthMethod.OAUTH2,
        authorize_url="https://www.facebook.com/v21.0/dialog/oauth",
        token_url="https://graph.facebook.com/v21.0/oauth/access_token",
        scopes=["instagram_basic", "instagram_content_publish"],
        client_id_env="INSTAGRAM_CLIENT_ID",
        client_secret_env="INSTAGRAM_CLIENT_SECRET",
    ),
    "facebook": OAuthPlatformConfig(
        platform_id="facebook",
        auth_method=AuthMethod.OAUTH2,
        authorize_url="https://www.facebook.com/v21.0/dialog/oauth",
        token_url="https://graph.facebook.com/v21.0/oauth/access_token",
        userinfo_url="https://graph.facebook.com/me?fields=id,name",
        scopes=["pages_manage_posts", "pages_read_engagement"],
        client_id_env="FACEBOOK_CLIENT_ID",
        client_secret_env="FACEBOOK_CLIENT_SECRET",
    ),
    "youtube": OAuthPlatformConfig(
        platform_id="youtube",
        auth_method=AuthMethod.OAUTH2,
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        userinfo_url="https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        scopes=[
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/youtube.readonly",
        ],
        client_id_env="YOUTUBE_CLIENT_ID",
        client_secret_env="YOUTUBE_CLIENT_SECRET",
        extra_authorize_params={"access_type": "offline", "prompt": "consent"},
    ),
    "tiktok": OAuthPlatformConfig(
        platform_id="tiktok",
        auth_method=AuthMethod.OAUTH2,
        authorize_url="https://www.tiktok.com/v2/auth/authorize/",
        token_url="https://open.tiktokapis.com/v2/oauth/token/",
        userinfo_url="https://open.tiktokapis.com/v2/user/info/",
        scopes=["user.info.basic", "video.publish", "video.upload"],
        client_id_env="TIKTOK_CLIENT_KEY",
        client_secret_env="TIKTOK_CLIENT_SECRET",
    ),
    "pinterest": OAuthPlatformConfig(
        platform_id="pinterest",
        auth_method=AuthMethod.OAUTH2,
        authorize_url="https://www.pinterest.com/oauth/",
        token_url="https://api.pinterest.com/v5/oauth/token",
        userinfo_url="https://api.pinterest.com/v5/user_account",
        scopes=["boards:read", "pins:read", "pins:write"],
        client_id_env="PINTEREST_CLIENT_ID",
        client_secret_env="PINTEREST_CLIENT_SECRET",
        token_auth_method=TokenAuthMethod.BASIC_AUTH,
    ),
    "reddit": OAuthPlatformConfig(
        platform_id="reddit",
        auth_method=AuthMethod.OAUTH2,
        authorize_url="https://www.reddit.com/api/v1/authorize",
        token_url="https://www.reddit.com/api/v1/access_token",
        userinfo_url="https://oauth.reddit.com/api/v1/me",
        scopes=["identity", "submit", "read"],
        client_id_env="REDDIT_CLIENT_ID",
        client_secret_env="REDDIT_CLIENT_SECRET",
        token_auth_method=TokenAuthMethod.BASIC_AUTH,
        extra_authorize_params={"duration": "permanent"},
    ),
    "medium": OAuthPlatformConfig(
        platform_id="medium",
        auth_method=AuthMethod.OAUTH2,
        authorize_url="https://medium.com/m/oauth/authorize",
        token_url="https://api.medium.com/v1/tokens",
        userinfo_url="https://api.medium.com/v1/me",
        scopes=["basicProfile", "publishPost"],
        client_id_env="MEDIUM_CLIENT_ID",
        client_secret_env="MEDIUM_CLIENT_SECRET",
    ),
    "threads": OAuthPlatformConfig(
        platform_id="threads",
        auth_method=AuthMethod.OAUTH2,
        authorize_url="https://threads.net/oauth/authorize",
        token_url="https://graph.threads.net/oauth/access_token",
        userinfo_url="https://graph.threads.net/v1.0/me?fields=id,username",
        scopes=["threads_basic", "threads_content_publish"],
        client_id_env="THREADS_CLIENT_ID",
        client_secret_env="THREADS_CLIENT_SECRET",
    ),
    # ------------------------------------------------------------------
    # App-password platform
    # ------------------------------------------------------------------
    "bluesky": OAuthPlatformConfig(
        platform_id="bluesky",
        auth_method=AuthMethod.APP_PASSWORD,
    ),
    # ------------------------------------------------------------------
    # Manual-only platforms (no connect button)
    # ------------------------------------------------------------------
    "substack": OAuthPlatformConfig(platform_id="substack", auth_method=AuthMethod.NONE),
    "quora": OAuthPlatformConfig(platform_id="quora", auth_method=AuthMethod.NONE),
    "email": OAuthPlatformConfig(platform_id="email", auth_method=AuthMethod.NONE),
    "press": OAuthPlatformConfig(platform_id="press", auth_method=AuthMethod.NONE),
    "slides": OAuthPlatformConfig(platform_id="slides", auth_method=AuthMethod.NONE),
}


def get_oauth_config(platform_id: str) -> OAuthPlatformConfig | None:
    """Look up the OAuth configuration for a platform."""
    return OAUTH_CONFIGS.get(platform_id)
