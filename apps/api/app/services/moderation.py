"""Content safety and platform compliance moderation service.

Screens generated content for safety issues, aggressive tone drift,
potential misinformation, and platform-specific TOS violations.
"""

import json
import logging

import anthropic

from app.config import get_settings
from app.platforms.profiles import get_platform
from app.services.ai import _extract_json_from_response, _get_client

logger = logging.getLogger(__name__)
settings = get_settings()

# Platform-specific rules used for compliance checks
_PLATFORM_RULES: dict[str, dict] = {
    "twitter_single": {
        "max_length": 280,
        "max_hashtags": 3,
        "link_note": "External links are fine but may reduce organic reach if posted without context.",
        "banned_patterns": [],
    },
    "twitter_thread": {
        "max_length": 3360,  # 12 tweets x 280
        "max_hashtags": 2,
        "link_note": "Links in the first tweet reduce visibility. Place links in later tweets.",
        "banned_patterns": [],
    },
    "linkedin_post": {
        "max_length": 3000,
        "max_hashtags": 5,
        "link_note": "External links in the post body reduce reach by up to 50%. Put links in the first comment.",
        "banned_patterns": ["engagement bait phrases like 'agree?'"],
    },
    "linkedin_article": {
        "max_length": 125000,
        "max_hashtags": 3,
        "link_note": "Links are fine in articles — they are expected.",
        "banned_patterns": [],
    },
    "bluesky_post": {
        "max_length": 300,
        "max_hashtags": 0,
        "link_note": "Links are fine. Community values authenticity over optimization.",
        "banned_patterns": [],
    },
    "instagram_carousel": {
        "max_length": 2200,
        "max_hashtags": 30,
        "link_note": "No clickable links in captions (link in bio only).",
        "banned_patterns": [],
    },
    "instagram_caption": {
        "max_length": 2200,
        "max_hashtags": 30,
        "link_note": "No clickable links in captions. Use 'link in bio' pattern.",
        "banned_patterns": [],
    },
    "pinterest_pin": {
        "max_length": 500,
        "max_hashtags": 20,
        "link_note": "Links are expected — Pinterest is a traffic driver.",
        "banned_patterns": [],
    },
    "blog_seo": {
        "max_length": 50000,
        "max_hashtags": 0,
        "link_note": "Internal and external links improve SEO.",
        "banned_patterns": ["keyword stuffing"],
    },
    "email_newsletter": {
        "max_length": 10000,
        "max_hashtags": 0,
        "link_note": "Limit to 2-3 links max to avoid spam filters.",
        "banned_patterns": ["spam trigger words in subject line"],
    },
    "medium_post": {
        "max_length": 50000,
        "max_hashtags": 5,
        "link_note": "Affiliate links and excessive self-promotion may be flagged.",
        "banned_patterns": [],
    },
    "youtube_longform": {
        "max_length": 50000,
        "max_hashtags": 15,
        "link_note": "Links go in the description. Mention them verbally in the script.",
        "banned_patterns": [],
    },
    "short_form_video": {
        "max_length": 5000,
        "max_hashtags": 5,
        "link_note": "No clickable links in the video itself. Direct to bio/profile link.",
        "banned_patterns": [],
    },
    "podcast_talking_points": {
        "max_length": 50000,
        "max_hashtags": 0,
        "link_note": "Mention URLs verbally and include in show notes.",
        "banned_patterns": [],
    },
    "reddit_post": {
        "max_length": 40000,
        "max_hashtags": 0,
        "link_note": "Self-promotion links are heavily penalized. Provide value first.",
        "banned_patterns": ["overt self-promotion", "link dropping without context"],
    },
    "quora_answer": {
        "max_length": 10000,
        "max_hashtags": 0,
        "link_note": "One relevant link is acceptable. Multiple links get flagged as spam.",
        "banned_patterns": ["not answering the question", "pure self-promotion"],
    },
    "press_release": {
        "max_length": 5000,
        "max_hashtags": 0,
        "link_note": "Include media contact and company URL.",
        "banned_patterns": ["promotional superlatives", "unsubstantiated claims"],
    },
    "slide_deck": {
        "max_length": 50000,
        "max_hashtags": 0,
        "link_note": "Links on final slide or in supplementary materials.",
        "banned_patterns": [],
    },
}


class ModerationService:
    """Screens generated content for safety and platform compliance."""

    async def screen_content(self, content: str, platform_id: str) -> dict:
        """Screen generated content for safety issues.

        Args:
            content: The generated content text to screen.
            platform_id: The target platform identifier.

        Returns:
            Dict with keys: is_safe (bool), flags (list[str]),
            severity (str: none/low/medium/high), details (str).
        """
        if not content or not content.strip():
            return {
                "is_safe": True,
                "flags": [],
                "severity": "none",
                "details": "Empty content — no issues detected.",
            }

        client = _get_client()
        if client is None:
            logger.warning("ANTHROPIC_API_KEY not configured; skipping content screening")
            return {
                "is_safe": True,
                "flags": ["moderation_skipped"],
                "severity": "none",
                "details": "Content screening skipped — API key not configured.",
            }

        platform = get_platform(platform_id)
        platform_name = platform.name if platform else platform_id

        prompt = f"""You are a content safety and moderation analyst. Review the following content intended for {platform_name} and check for safety issues.

## Content to Review
{content[:5000]}

## Check for these issues:
1. Hate speech or discriminatory language
2. Aggressive or hostile tone that could harm the creator's reputation
3. Potential misinformation or unverifiable claims presented as facts
4. Spam signals (excessive repetition, all caps, clickbait without substance)
5. Content that could violate {platform_name}'s terms of service
6. Inappropriate or offensive language for the platform context
7. Privacy concerns (accidental disclosure of personal information patterns)
8. Legal liability risks (defamation, unsubstantiated health/financial claims)

Return ONLY a JSON object with this exact structure:
{{"is_safe": true/false, "flags": ["flag_name_1", "flag_name_2"], "severity": "none|low|medium|high", "details": "Brief explanation of findings"}}

If the content is clean, return: {{"is_safe": true, "flags": [], "severity": "none", "details": "No safety issues detected."}}"""

        try:
            message = await client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=512,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = message.content[0].text
            result = _extract_json_from_response(response_text)

            return {
                "is_safe": result.get("is_safe", True),
                "flags": result.get("flags", []),
                "severity": result.get("severity", "none"),
                "details": result.get("details", ""),
            }

        except (json.JSONDecodeError, ValueError) as e:
            logger.error("Failed to parse moderation response: %s", str(e))
            return {
                "is_safe": True,
                "flags": ["parse_error"],
                "severity": "none",
                "details": f"Moderation check completed but response parsing failed: {str(e)}",
            }
        except anthropic.APIError as e:
            logger.error("API error during content screening: %s", str(e))
            return {
                "is_safe": True,
                "flags": ["api_error"],
                "severity": "none",
                "details": f"Moderation check failed due to API error: {str(e)}",
            }
        except Exception as e:
            logger.error("Unexpected error during content screening: %s", str(e))
            return {
                "is_safe": True,
                "flags": ["unexpected_error"],
                "severity": "none",
                "details": f"Moderation check encountered an error: {str(e)}",
            }

    async def check_platform_compliance(self, content: str, platform_id: str) -> dict:
        """Check content against platform-specific rules.

        Args:
            content: The generated content text to check.
            platform_id: The target platform identifier.

        Returns:
            Dict with keys: compliant (bool), issues (list[str]),
            suggestions (list[str]).
        """
        issues: list[str] = []
        suggestions: list[str] = []

        if not content or not content.strip():
            return {
                "compliant": True,
                "issues": [],
                "suggestions": [],
            }

        rules = _PLATFORM_RULES.get(platform_id, {})

        # --- Length check ---
        max_length = rules.get("max_length", 50000)
        content_length = len(content)

        if content_length > max_length:
            issues.append(
                f"Content exceeds platform limit: {content_length} characters "
                f"(max {max_length})"
            )
            suggestions.append(
                f"Trim content to under {max_length} characters for {platform_id}."
            )

        # --- Hashtag check ---
        max_hashtags = rules.get("max_hashtags", 30)
        hashtag_count = content.count("#")

        if hashtag_count > max_hashtags and max_hashtags > 0:
            issues.append(
                f"Too many hashtags: {hashtag_count} (max {max_hashtags} recommended)"
            )
            suggestions.append(
                f"Reduce hashtags to {max_hashtags} or fewer for optimal {platform_id} performance."
            )
        elif max_hashtags == 0 and hashtag_count > 0:
            # Platforms where hashtags are not a convention
            if platform_id in ("bluesky_post", "email_newsletter", "press_release", "slide_deck"):
                suggestions.append(
                    f"Hashtags are not conventional on {platform_id}. Consider removing them."
                )

        # --- Link check ---
        link_note = rules.get("link_note", "")
        has_links = "http://" in content or "https://" in content or "www." in content

        if has_links and link_note:
            # Check for platforms where links in the body are problematic
            if platform_id == "linkedin_post":
                issues.append("External link detected in LinkedIn post body.")
                suggestions.append(
                    "Move the link to the first comment. Links in LinkedIn post bodies "
                    "reduce organic reach by up to 50%."
                )
            elif platform_id in ("instagram_caption", "instagram_carousel"):
                issues.append("Link detected in Instagram caption (not clickable).")
                suggestions.append(
                    "Remove the URL and use a 'link in bio' reference instead."
                )
            elif platform_id == "reddit_post":
                suggestions.append(
                    "Ensure the link adds genuine value. Reddit penalizes self-promotional link dropping."
                )

        # --- Platform-specific content pattern checks ---
        banned_patterns = rules.get("banned_patterns", [])
        content_lower = content.lower()

        for pattern_desc in banned_patterns:
            if "keyword stuffing" in pattern_desc:
                # Simple heuristic: check for repeated phrases
                words = content_lower.split()
                if len(words) > 20:
                    word_freq: dict[str, int] = {}
                    for word in words:
                        if len(word) > 4:
                            word_freq[word] = word_freq.get(word, 0) + 1
                    max_freq = max(word_freq.values()) if word_freq else 0
                    if max_freq > len(words) * 0.05:
                        issues.append("Possible keyword stuffing detected.")
                        suggestions.append(
                            "Vary your vocabulary to avoid keyword stuffing penalties."
                        )

            if "self-promotion" in pattern_desc or "overt self-promotion" in pattern_desc:
                promo_signals = [
                    "check out my",
                    "buy my",
                    "use my code",
                    "sign up for my",
                    "download my",
                    "visit my website",
                ]
                for signal in promo_signals:
                    if signal in content_lower:
                        issues.append(
                            f"Self-promotional language detected: '{signal}'"
                        )
                        suggestions.append(
                            f"On {platform_id}, lead with value and minimize direct self-promotion."
                        )
                        break

            if "engagement bait" in pattern_desc:
                bait_phrases = [
                    "like if you agree",
                    "share if you",
                    "comment yes if",
                    "type 'yes'",
                    "repost if",
                ]
                for phrase in bait_phrases:
                    if phrase in content_lower:
                        issues.append(
                            f"Engagement bait detected: '{phrase}'"
                        )
                        suggestions.append(
                            "Replace engagement bait with a genuine discussion prompt."
                        )
                        break

        # --- Twitter-specific per-tweet length check ---
        if platform_id == "twitter_thread" and "---" in content:
            tweets = [t.strip() for t in content.split("---") if t.strip()]
            for i, tweet in enumerate(tweets, 1):
                if len(tweet) > 280:
                    issues.append(
                        f"Tweet {i} in thread exceeds 280 characters ({len(tweet)} chars)."
                    )
                    suggestions.append(
                        f"Shorten tweet {i} to fit within 280 characters."
                    )

        compliant = len(issues) == 0

        return {
            "compliant": compliant,
            "issues": issues,
            "suggestions": suggestions,
        }
