"use strict";
/**
 * PublisherRegistry singleton — maps platformId → publisher implementation.
 * Port of apps/api/app/services/publisher.py PublisherRegistry + init_publishers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublisher = getPublisher;
exports.isSupported = isSupported;
exports.getSupportedPlatforms = getSupportedPlatforms;
const twitter_js_1 = require("./twitter.js");
const linkedin_js_1 = require("./linkedin.js");
const bluesky_js_1 = require("./bluesky.js");
const stubs_js_1 = require("./stubs.js");
const _publishers = {};
function register(platformId, publisher) {
    _publishers[platformId] = publisher;
}
function getPublisher(platformId) {
    return _publishers[platformId];
}
function isSupported(platformId) {
    return platformId in _publishers;
}
function getSupportedPlatforms() {
    return Object.keys(_publishers);
}
// Initialize all publishers
const twitter = new twitter_js_1.TwitterPublisher();
const linkedin = new linkedin_js_1.LinkedInPublisher();
const bluesky = new bluesky_js_1.BlueskyPublisher();
// Tier 1
register("twitter_single", twitter);
register("twitter_thread", twitter);
register("linkedin_post", linkedin);
register("linkedin_article", linkedin);
register("bluesky_post", bluesky);
// Tier 2
register("instagram_carousel", stubs_js_1.InstagramPublisher);
register("instagram_caption", stubs_js_1.InstagramPublisher);
register("pinterest_pin", stubs_js_1.PinterestPublisher);
// Tier 3
register("medium_post", stubs_js_1.MediumPublisher);
// Tier 4
register("youtube_longform", stubs_js_1.YouTubePublisher);
register("short_form_video", stubs_js_1.TikTokPublisher);
// Tier 5
register("reddit_post", stubs_js_1.RedditPublisher);
register("quora_answer", stubs_js_1.QuoraPublisher);
//# sourceMappingURL=registry.js.map