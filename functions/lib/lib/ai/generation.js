"use strict";
/**
 * Per-format content generation — port of apps/api/app/services/transformation.py.
 * TransformationEngine.generate_single_output + _build_generation_prompt.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_FIT_SCORE = void 0;
exports.evaluatePlatformFit = evaluatePlatformFit;
exports.generateSingleOutput = generateSingleOutput;
const anthropic_js_1 = require("../../config/anthropic.js");
// Content-type-to-platform affinity mapping (same as Python)
const CONTENT_TYPE_PLATFORM_AFFINITY = {
    thought_leadership: {
        twitter_single: 0.7, twitter_thread: 0.9, linkedin_post: 0.95, linkedin_article: 0.95,
        bluesky_post: 0.7, instagram_carousel: 0.6, instagram_caption: 0.4, pinterest_pin: 0.3,
        blog_seo: 0.85, email_newsletter: 0.8, medium_post: 0.9, youtube_longform: 0.7,
        short_form_video: 0.5, podcast_talking_points: 0.8, reddit_post: 0.75, quora_answer: 0.8,
        press_release: 0.3, slide_deck: 0.85,
    },
    how_to: {
        twitter_single: 0.5, twitter_thread: 0.85, linkedin_post: 0.7, linkedin_article: 0.8,
        bluesky_post: 0.5, instagram_carousel: 0.95, instagram_caption: 0.5, pinterest_pin: 0.9,
        blog_seo: 0.95, email_newsletter: 0.75, medium_post: 0.85, youtube_longform: 0.9,
        short_form_video: 0.8, podcast_talking_points: 0.7, reddit_post: 0.85, quora_answer: 0.9,
        press_release: 0.1, slide_deck: 0.8,
    },
    case_study: {
        twitter_single: 0.5, twitter_thread: 0.8, linkedin_post: 0.85, linkedin_article: 0.9,
        bluesky_post: 0.4, instagram_carousel: 0.8, instagram_caption: 0.5, pinterest_pin: 0.3,
        blog_seo: 0.9, email_newsletter: 0.8, medium_post: 0.85, youtube_longform: 0.75,
        short_form_video: 0.6, podcast_talking_points: 0.7, reddit_post: 0.8, quora_answer: 0.7,
        press_release: 0.6, slide_deck: 0.85,
    },
    opinion: {
        twitter_single: 0.95, twitter_thread: 0.8, linkedin_post: 0.9, linkedin_article: 0.7,
        bluesky_post: 0.9, instagram_carousel: 0.5, instagram_caption: 0.6, pinterest_pin: 0.2,
        blog_seo: 0.6, email_newsletter: 0.75, medium_post: 0.8, youtube_longform: 0.65,
        short_form_video: 0.7, podcast_talking_points: 0.75, reddit_post: 0.85, quora_answer: 0.6,
        press_release: 0.1, slide_deck: 0.4,
    },
    announcement: {
        twitter_single: 0.85, twitter_thread: 0.5, linkedin_post: 0.8, linkedin_article: 0.4,
        bluesky_post: 0.75, instagram_carousel: 0.3, instagram_caption: 0.7, pinterest_pin: 0.2,
        blog_seo: 0.6, email_newsletter: 0.9, medium_post: 0.5, youtube_longform: 0.4,
        short_form_video: 0.6, podcast_talking_points: 0.4, reddit_post: 0.6, quora_answer: 0.2,
        press_release: 0.95, slide_deck: 0.3,
    },
    personal_story: {
        twitter_single: 0.6, twitter_thread: 0.85, linkedin_post: 0.95, linkedin_article: 0.6,
        bluesky_post: 0.8, instagram_carousel: 0.6, instagram_caption: 0.9, pinterest_pin: 0.2,
        blog_seo: 0.5, email_newsletter: 0.9, medium_post: 0.85, youtube_longform: 0.7,
        short_form_video: 0.8, podcast_talking_points: 0.85, reddit_post: 0.75, quora_answer: 0.6,
        press_release: 0.1, slide_deck: 0.3,
    },
};
const DEFAULT_AFFINITY = 0.5;
const MIN_FIT_SCORE = 0.3;
exports.MIN_FIT_SCORE = MIN_FIT_SCORE;
function evaluatePlatformFit(contentDna, platform) {
    const contentType = contentDna.contentTypeClassification || "unknown";
    const affinityMap = CONTENT_TYPE_PLATFORM_AFFINITY[contentType] ?? {};
    let score = affinityMap[platform.platformId] ?? DEFAULT_AFFINITY;
    const keyPoints = contentDna.keyPoints || [];
    const hooks = contentDna.bestHooks || [];
    const quotes = contentDna.quotableMoments || [];
    if (keyPoints.length >= 4 && ["twitter_thread", "linkedin_article", "blog_seo", "medium_post", "youtube_longform", "slide_deck", "instagram_carousel"].includes(platform.platformId)) {
        score += 0.05;
    }
    if (hooks.length >= 3 && ["twitter_single", "short_form_video", "instagram_caption", "bluesky_post"].includes(platform.platformId)) {
        score += 0.05;
    }
    if (quotes.length >= 3 && ["twitter_single", "instagram_caption", "email_newsletter", "linkedin_post"].includes(platform.platformId)) {
        score += 0.05;
    }
    for (const suggestion of contentDna.suggestedPlatforms || []) {
        const pid = suggestion.platformId || "";
        if (pid === platform.platformId || platform.platformId.includes(pid)) {
            if (suggestion.fitScore > 0.7)
                score += 0.05;
            break;
        }
    }
    return Math.round(Math.min(1.0, Math.max(0.0, score)) * 100) / 100;
}
const FORMAT_INSTRUCTIONS = {
    twitter_thread: `
## Format-Specific Instructions
Return numbered tweets separated by lines containing only \`---\`. Each tweet must be under 280 characters. The hook tweet (1/) is the most important.`,
    instagram_carousel: `
## Format-Specific Instructions
Return slide-by-slide content with [Slide N] markers. Keep each slide to 1-2 short sentences maximum.`,
    youtube_longform: `
## Format-Specific Instructions
Return a structured video script with [HOOK], [INTRO], [SECTION N: Title], [CTA], [OUTRO], [TIMESTAMPS], [THUMBNAIL IDEAS] markers.`,
    short_form_video: `
## Format-Specific Instructions
Return a teleprompter-style script with [HOOK], [CONTEXT], [VALUE], [CTA] sections and visual cues. Under 60 seconds total.`,
    email_newsletter: `
## Format-Specific Instructions
Return with labeled sections: SUBJECT (50 chars max), PREVIEW (90 chars max), BODY (with PS line).`,
    slide_deck: `
## Format-Specific Instructions
Return with [Slide N: Title] markers and Speaker Notes for each slide. Keep slide text minimal (6 words per line, 6 lines max).`,
    press_release: `
## Format-Specific Instructions
Return in AP-style format: FOR IMMEDIATE RELEASE, HEADLINE, SUBHEADLINE, DATELINE, body, quote, boilerplate, contact info.`,
    podcast_talking_points: `
## Format-Specific Instructions
Return structured outline: EPISODE TITLE, COLD OPEN, INTRO, SEGMENT N with talking points, LISTENER ENGAGEMENT, OUTRO, SHOW NOTES.`,
};
async function generateSingleOutput(contentDna, platform, voiceProfile, rawContent, emphasisNotes) {
    const anthropic = (0, anthropic_js_1.getAnthropic)();
    const prompt = buildGenerationPrompt(contentDna, platform, voiceProfile, rawContent, emphasisNotes);
    const maxTokens = ["youtube_longform", "blog_seo", "slide_deck", "podcast_talking_points"].includes(platform.platformId) ? 6000 : 4096;
    try {
        const message = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: maxTokens,
            messages: [{ role: "user", content: prompt }],
        });
        const generatedContent = message.content[0].type === "text" ? message.content[0].text.trim() : "";
        return {
            content: generatedContent,
            metadata: {
                platform_id: platform.platformId,
                model: "claude-sonnet-4-20250514",
                input_tokens: message.usage.input_tokens,
                output_tokens: message.usage.output_tokens,
            },
        };
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`Generation error for ${platform.platformId}:`, errorMsg);
        return {
            content: "",
            metadata: { error: errorMsg, platform_id: platform.platformId },
        };
    }
}
function buildGenerationPrompt(contentDna, platform, voiceProfile, rawContent, emphasisNotes) {
    const coreIdea = contentDna.coreIdea || "Not available";
    const formattedKeyPoints = (contentDna.keyPoints || [])
        .map((kp, i) => `  ${i + 1}. ${kp.point} (strength: ${kp.strength})`)
        .join("\n") || "  No key points extracted.";
    const formattedHooks = (contentDna.bestHooks || [])
        .map((h, i) => `  ${i + 1}. [${h.hookType}] ${h.hook}`)
        .join("\n") || "  No hooks extracted.";
    const formattedQuotes = (contentDna.quotableMoments || [])
        .map((q, i) => `  ${i + 1}. "${q}"`)
        .join("\n") || "  No quotable moments extracted.";
    const templatesStr = platform.structuralTemplates.map((t) => `  - ${t}`).join("\n");
    const ctaStr = platform.ctaStyles.map((c) => `  - ${c}`).join("\n");
    let voiceSection;
    if (voiceProfile) {
        const attrs = voiceProfile.voiceAttributes || [];
        const tone = voiceProfile.toneMetrics || {};
        const vocab = voiceProfile.vocabulary || {};
        const topics = voiceProfile.topicBoundaries || {};
        const ctaLib = voiceProfile.ctaLibrary || [];
        const banned = vocab.banned_terms ?? [];
        const preferred = vocab.preferred_terms ?? [];
        voiceSection = `
## Creator's Voice
Voice Attributes: ${attrs.join(", ") || "Natural, authentic"}
Tone Metrics:
  Formality: ${tone.formality ?? 0.5}/1.0
  Humor: ${tone.humor ?? 0.5}/1.0
  Vulnerability: ${tone.vulnerability ?? 0.5}/1.0
  Directness: ${tone.directness ?? 0.5}/1.0
  Jargon Density: ${tone.jargon_density ?? 0.5}/1.0
Preferred Terms: ${preferred.join(", ") || "None specified"}
Banned Terms (NEVER use): ${banned.join(", ") || "None specified"}
CTA Library: ${ctaLib.slice(0, 5).join(", ") || "Use platform-native CTAs"}
Approved Topics: ${(topics.approved_topics ?? []).join(", ") || "No restrictions"}
Restricted Topics (AVOID): ${(topics.restricted_topics ?? []).join(", ") || "None"}`;
    }
    else {
        voiceSection = `
## Creator's Voice
No specific voice profile provided. Use a natural, professional, engaging tone that matches the platform's native style.`;
    }
    const emphasisSection = emphasisNotes ? `\n## Additional Direction from Creator\n${emphasisNotes}\n` : "";
    const formatInstructions = FORMAT_INSTRUCTIONS[platform.platformId] || "";
    const rawExcerpt = rawContent.substring(0, 5000);
    return `You are a world-class content strategist creating a ${platform.name} post.

Your job is to transform the source content analysis into a platform-optimized piece that stands completely on its own, matches the creator's voice, and is engineered for maximum performance on ${platform.name}.

## Source Content Analysis
Core Idea: ${coreIdea}

Key Points:
${formattedKeyPoints}
Best Hooks:
${formattedHooks}
Quotable Moments:
${formattedQuotes}

## Original Content Excerpt (for additional context)
${rawExcerpt}

## Platform Requirements
Platform: ${platform.name}
Native Tone: ${platform.nativeTone}
Length: Target ${platform.lengthRange.ideal} characters (minimum ${platform.lengthRange.min}, maximum ${platform.lengthRange.max})
Structural Templates:
${templatesStr}
Algorithm Optimization: Content performs best when it drives ${platform.algorithmSignals.primary}. Secondary signal: ${platform.algorithmSignals.secondary}. Avoid: ${platform.algorithmSignals.negative}
CTA Styles:
${ctaStr}
Audience Intent: ${platform.audienceIntent}
${voiceSection}${emphasisSection}
## Generation Rules
1. The output MUST be completely standalone — it delivers full value without reading the original content
2. Match the creator's voice exactly (if a voice profile is provided)
3. Optimize for ${platform.name}'s algorithm and audience intent
4. Stay within the character/word limits: target ${platform.lengthRange.ideal}, max ${platform.lengthRange.max} characters
5. Use the strongest hook from the source content, adapted for this platform's native style
6. Include a natural, platform-appropriate CTA
7. Do NOT mention that this was generated from another piece of content
8. Do NOT use generic filler — every sentence must earn its place
${formatInstructions}

Generate the ${platform.name} content now. Return ONLY the post content — no explanations, no metadata, no commentary.`;
}
//# sourceMappingURL=generation.js.map