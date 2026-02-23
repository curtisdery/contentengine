"use strict";
/**
 * OAuth configuration per platform — port of apps/api/app/platforms/oauth_configs.py.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenAuthMethod = exports.AuthMethod = void 0;
exports.getOAuthConfig = getOAuthConfig;
exports.getAllOAuthConfigs = getAllOAuthConfigs;
var AuthMethod;
(function (AuthMethod) {
    AuthMethod["OAUTH2"] = "oauth2";
    AuthMethod["APP_PASSWORD"] = "app_password";
    AuthMethod["API_KEY"] = "api_key";
    AuthMethod["NONE"] = "none";
})(AuthMethod || (exports.AuthMethod = AuthMethod = {}));
var TokenAuthMethod;
(function (TokenAuthMethod) {
    TokenAuthMethod["POST_BODY"] = "post_body";
    TokenAuthMethod["BASIC_AUTH"] = "basic_auth";
})(TokenAuthMethod || (exports.TokenAuthMethod = TokenAuthMethod = {}));
const OAUTH_CONFIGS = {
    twitter: {
        platformId: "twitter",
        authMethod: AuthMethod.OAUTH2,
        authorizeUrl: "https://twitter.com/i/oauth2/authorize",
        tokenUrl: "https://api.twitter.com/2/oauth2/token",
        userinfoUrl: "https://api.twitter.com/2/users/me",
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
        clientIdEnv: "TWITTER_CLIENT_ID",
        clientSecretEnv: "TWITTER_CLIENT_SECRET",
        usesPkce: true,
        tokenAuthMethod: TokenAuthMethod.POST_BODY,
        extraAuthorizeParams: {},
        extraTokenParams: {},
    },
    linkedin: {
        platformId: "linkedin",
        authMethod: AuthMethod.OAUTH2,
        authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        userinfoUrl: "https://api.linkedin.com/v2/userinfo",
        scopes: ["openid", "profile", "email", "w_member_social"],
        clientIdEnv: "LINKEDIN_CLIENT_ID",
        clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
        usesPkce: false,
        tokenAuthMethod: TokenAuthMethod.POST_BODY,
        extraAuthorizeParams: {},
        extraTokenParams: {},
    },
    instagram: {
        platformId: "instagram",
        authMethod: AuthMethod.OAUTH2,
        authorizeUrl: "https://api.instagram.com/oauth/authorize",
        tokenUrl: "https://api.instagram.com/oauth/access_token",
        userinfoUrl: "https://graph.instagram.com/me?fields=id,username",
        scopes: ["instagram_basic", "instagram_content_publish"],
        clientIdEnv: "INSTAGRAM_CLIENT_ID",
        clientSecretEnv: "INSTAGRAM_CLIENT_SECRET",
        usesPkce: false,
        tokenAuthMethod: TokenAuthMethod.POST_BODY,
        extraAuthorizeParams: {},
        extraTokenParams: {},
    },
    youtube: {
        platformId: "youtube",
        authMethod: AuthMethod.OAUTH2,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userinfoUrl: "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        scopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
        clientIdEnv: "YOUTUBE_CLIENT_ID",
        clientSecretEnv: "YOUTUBE_CLIENT_SECRET",
        usesPkce: false,
        tokenAuthMethod: TokenAuthMethod.POST_BODY,
        extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
        extraTokenParams: {},
    },
    tiktok: {
        platformId: "tiktok",
        authMethod: AuthMethod.OAUTH2,
        authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
        tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
        userinfoUrl: "https://open.tiktokapis.com/v2/user/info/",
        scopes: ["user.info.basic", "video.publish"],
        clientIdEnv: "TIKTOK_CLIENT_ID",
        clientSecretEnv: "TIKTOK_CLIENT_SECRET",
        usesPkce: true,
        tokenAuthMethod: TokenAuthMethod.POST_BODY,
        extraAuthorizeParams: {},
        extraTokenParams: {},
    },
    pinterest: {
        platformId: "pinterest",
        authMethod: AuthMethod.OAUTH2,
        authorizeUrl: "https://www.pinterest.com/oauth/",
        tokenUrl: "https://api.pinterest.com/v5/oauth/token",
        userinfoUrl: "https://api.pinterest.com/v5/user_account",
        scopes: ["boards:read", "pins:read", "pins:write"],
        clientIdEnv: "PINTEREST_CLIENT_ID",
        clientSecretEnv: "PINTEREST_CLIENT_SECRET",
        usesPkce: false,
        tokenAuthMethod: TokenAuthMethod.BASIC_AUTH,
        extraAuthorizeParams: {},
        extraTokenParams: {},
    },
    reddit: {
        platformId: "reddit",
        authMethod: AuthMethod.OAUTH2,
        authorizeUrl: "https://www.reddit.com/api/v1/authorize",
        tokenUrl: "https://www.reddit.com/api/v1/access_token",
        userinfoUrl: "https://oauth.reddit.com/api/v1/me",
        scopes: ["identity", "submit", "read"],
        clientIdEnv: "REDDIT_CLIENT_ID",
        clientSecretEnv: "REDDIT_CLIENT_SECRET",
        usesPkce: false,
        tokenAuthMethod: TokenAuthMethod.BASIC_AUTH,
        extraAuthorizeParams: { duration: "permanent" },
        extraTokenParams: {},
    },
    medium: {
        platformId: "medium",
        authMethod: AuthMethod.OAUTH2,
        authorizeUrl: "https://medium.com/m/oauth/authorize",
        tokenUrl: "https://api.medium.com/v1/tokens",
        userinfoUrl: "https://api.medium.com/v1/me",
        scopes: ["basicProfile", "publishPost"],
        clientIdEnv: "MEDIUM_CLIENT_ID",
        clientSecretEnv: "MEDIUM_CLIENT_SECRET",
        usesPkce: false,
        tokenAuthMethod: TokenAuthMethod.POST_BODY,
        extraAuthorizeParams: {},
        extraTokenParams: {},
    },
    bluesky: {
        platformId: "bluesky",
        authMethod: AuthMethod.APP_PASSWORD,
        authorizeUrl: "",
        tokenUrl: "",
        userinfoUrl: null,
        scopes: [],
        clientIdEnv: "",
        clientSecretEnv: "",
        usesPkce: false,
        tokenAuthMethod: TokenAuthMethod.POST_BODY,
        extraAuthorizeParams: {},
        extraTokenParams: {},
    },
};
function getOAuthConfig(platformId) {
    return OAUTH_CONFIGS[platformId];
}
function getAllOAuthConfigs() {
    return Object.values(OAUTH_CONFIGS);
}
//# sourceMappingURL=oauthConfigs.js.map