"use strict";
/**
 * Stub publishers for platforms not yet fully implemented.
 * Each returns a helpful "not yet implemented" message.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuoraPublisher = exports.MediumPublisher = exports.RedditPublisher = exports.PinterestPublisher = exports.TikTokPublisher = exports.YouTubePublisher = exports.InstagramPublisher = void 0;
function stubPublisher(platformName) {
    return {
        async publish() {
            return {
                success: false,
                postId: null,
                url: null,
                error: `${platformName} publishing not yet implemented. Copy content from dashboard.`,
            };
        },
        async validateConnection() {
            return false;
        },
        async refreshToken() {
            return null;
        },
    };
}
exports.InstagramPublisher = stubPublisher("Instagram");
exports.YouTubePublisher = stubPublisher("YouTube");
exports.TikTokPublisher = stubPublisher("TikTok");
exports.PinterestPublisher = stubPublisher("Pinterest");
exports.RedditPublisher = stubPublisher("Reddit");
exports.MediumPublisher = stubPublisher("Medium");
exports.QuoraPublisher = stubPublisher("Quora");
//# sourceMappingURL=stubs.js.map