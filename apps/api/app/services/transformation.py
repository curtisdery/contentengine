"""Transformation Engine — the core service for generating platform-optimized content.

For each platform format, the engine:
1. Selects the right content slice from the DNA card
2. Applies the platform DNA template
3. Applies the brand voice filter
4. Generates via Claude
5. Scores voice match
"""

import json
import logging

import anthropic

from app.config import get_settings
from app.models.brand_voice import BrandVoiceProfile
from app.models.content import ContentUpload, GeneratedOutput
from app.platforms.profiles import PlatformProfile, get_all_platforms, get_platform
from app.services.ai import _extract_json_from_response, _get_client

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Content-type-to-platform affinity mapping
# ---------------------------------------------------------------------------

_CONTENT_TYPE_PLATFORM_AFFINITY: dict[str, dict[str, float]] = {
    "thought_leadership": {
        "twitter_single": 0.7,
        "twitter_thread": 0.9,
        "linkedin_post": 0.95,
        "linkedin_article": 0.95,
        "bluesky_post": 0.7,
        "instagram_carousel": 0.6,
        "instagram_caption": 0.4,
        "pinterest_pin": 0.3,
        "blog_seo": 0.85,
        "email_newsletter": 0.8,
        "medium_post": 0.9,
        "youtube_longform": 0.7,
        "short_form_video": 0.5,
        "podcast_talking_points": 0.8,
        "reddit_post": 0.75,
        "quora_answer": 0.8,
        "press_release": 0.3,
        "slide_deck": 0.85,
    },
    "how_to": {
        "twitter_single": 0.5,
        "twitter_thread": 0.85,
        "linkedin_post": 0.7,
        "linkedin_article": 0.8,
        "bluesky_post": 0.5,
        "instagram_carousel": 0.95,
        "instagram_caption": 0.5,
        "pinterest_pin": 0.9,
        "blog_seo": 0.95,
        "email_newsletter": 0.75,
        "medium_post": 0.85,
        "youtube_longform": 0.9,
        "short_form_video": 0.8,
        "podcast_talking_points": 0.7,
        "reddit_post": 0.85,
        "quora_answer": 0.9,
        "press_release": 0.1,
        "slide_deck": 0.8,
    },
    "case_study": {
        "twitter_single": 0.5,
        "twitter_thread": 0.8,
        "linkedin_post": 0.85,
        "linkedin_article": 0.9,
        "bluesky_post": 0.4,
        "instagram_carousel": 0.8,
        "instagram_caption": 0.5,
        "pinterest_pin": 0.3,
        "blog_seo": 0.9,
        "email_newsletter": 0.8,
        "medium_post": 0.85,
        "youtube_longform": 0.75,
        "short_form_video": 0.6,
        "podcast_talking_points": 0.7,
        "reddit_post": 0.8,
        "quora_answer": 0.7,
        "press_release": 0.6,
        "slide_deck": 0.85,
    },
    "opinion": {
        "twitter_single": 0.95,
        "twitter_thread": 0.8,
        "linkedin_post": 0.9,
        "linkedin_article": 0.7,
        "bluesky_post": 0.9,
        "instagram_carousel": 0.5,
        "instagram_caption": 0.6,
        "pinterest_pin": 0.2,
        "blog_seo": 0.6,
        "email_newsletter": 0.75,
        "medium_post": 0.8,
        "youtube_longform": 0.65,
        "short_form_video": 0.7,
        "podcast_talking_points": 0.75,
        "reddit_post": 0.85,
        "quora_answer": 0.6,
        "press_release": 0.1,
        "slide_deck": 0.4,
    },
    "announcement": {
        "twitter_single": 0.85,
        "twitter_thread": 0.5,
        "linkedin_post": 0.8,
        "linkedin_article": 0.4,
        "bluesky_post": 0.75,
        "instagram_carousel": 0.3,
        "instagram_caption": 0.7,
        "pinterest_pin": 0.2,
        "blog_seo": 0.6,
        "email_newsletter": 0.9,
        "medium_post": 0.5,
        "youtube_longform": 0.4,
        "short_form_video": 0.6,
        "podcast_talking_points": 0.4,
        "reddit_post": 0.6,
        "quora_answer": 0.2,
        "press_release": 0.95,
        "slide_deck": 0.3,
    },
    "personal_story": {
        "twitter_single": 0.6,
        "twitter_thread": 0.85,
        "linkedin_post": 0.95,
        "linkedin_article": 0.6,
        "bluesky_post": 0.8,
        "instagram_carousel": 0.6,
        "instagram_caption": 0.9,
        "pinterest_pin": 0.2,
        "blog_seo": 0.5,
        "email_newsletter": 0.9,
        "medium_post": 0.85,
        "youtube_longform": 0.7,
        "short_form_video": 0.8,
        "podcast_talking_points": 0.85,
        "reddit_post": 0.75,
        "quora_answer": 0.6,
        "press_release": 0.1,
        "slide_deck": 0.3,
    },
}

# Fallback affinity for unknown content types
_DEFAULT_AFFINITY = 0.5

# Minimum fit score for a platform to be considered applicable
_MIN_FIT_SCORE = 0.3


class TransformationEngine:
    """Core engine that transforms content DNA into platform-specific outputs."""

    def evaluate_platform_fit(
        self, content_dna: dict, platform: PlatformProfile
    ) -> float:
        """Score 0-1 how well this content fits this platform.

        Uses the content_type_classification from the DNA card to look up pre-defined
        affinity scores, then applies adjustments based on content richness signals
        (number of key points, hooks, quotable moments, etc.).
        """
        content_type = content_dna.get("content_type_classification", "unknown")
        affinity_map = _CONTENT_TYPE_PLATFORM_AFFINITY.get(content_type, {})
        base_score = affinity_map.get(platform.platform_id, _DEFAULT_AFFINITY)

        # Adjust based on content richness
        adjustments = 0.0

        key_points = content_dna.get("key_points", [])
        hooks = content_dna.get("best_hooks", [])
        quotes = content_dna.get("quotable_moments", [])

        # Data-rich content gets a boost for long-form and thread platforms
        if len(key_points) >= 4:
            if platform.platform_id in (
                "twitter_thread",
                "linkedin_article",
                "blog_seo",
                "medium_post",
                "youtube_longform",
                "slide_deck",
                "instagram_carousel",
            ):
                adjustments += 0.05

        # Hook-rich content gets a boost for hook-dependent platforms
        if len(hooks) >= 3:
            if platform.platform_id in (
                "twitter_single",
                "short_form_video",
                "instagram_caption",
                "bluesky_post",
            ):
                adjustments += 0.05

        # Quote-rich content gets a boost for quote-friendly platforms
        if len(quotes) >= 3:
            if platform.platform_id in (
                "twitter_single",
                "instagram_caption",
                "email_newsletter",
                "linkedin_post",
            ):
                adjustments += 0.05

        # If the DNA suggests specific platforms, boost those
        suggested_platforms = content_dna.get("suggested_platforms", [])
        for suggestion in suggested_platforms:
            pid = suggestion.get("platform_id", "")
            # Handle cases where DNA suggestions use short names
            if pid == platform.platform_id or pid in platform.platform_id:
                fit = suggestion.get("fit_score", 0.0)
                if fit > 0.7:
                    adjustments += 0.05
                break

        final_score = min(1.0, max(0.0, base_score + adjustments))
        return round(final_score, 2)

    async def generate_all_outputs(
        self,
        db: AsyncSession,
        content_upload: ContentUpload,
        voice_profile: BrandVoiceProfile | None,
        selected_platforms: list[str] | None = None,
    ) -> list[GeneratedOutput]:
        """Generate outputs for all applicable platforms.

        Args:
            db: The async database session.
            content_upload: The content upload with its DNA card.
            voice_profile: Optional brand voice profile for voice matching.
            selected_platforms: Optional list of platform IDs. None = all applicable.

        Returns:
            List of GeneratedOutput records saved to the database.
        """
        content_dna = content_upload.content_dna or {}

        # Determine which platforms to generate for
        if selected_platforms:
            platforms = [
                get_platform(pid)
                for pid in selected_platforms
                if get_platform(pid) is not None
            ]
        else:
            # Evaluate fit for all platforms and filter by minimum threshold
            all_platforms = get_all_platforms()
            platforms = []
            for platform in all_platforms:
                fit_score = self.evaluate_platform_fit(content_dna, platform)
                if fit_score >= _MIN_FIT_SCORE:
                    platforms.append(platform)

        # Retrieve emphasis notes from DNA user adjustments if present
        emphasis_notes = None
        user_adjustments = content_dna.get("user_adjustments", {})
        if user_adjustments:
            emphasis_notes = user_adjustments.get("emphasis_notes")

        generated_outputs: list[GeneratedOutput] = []

        for platform in platforms:
            try:
                result = await self.generate_single_output(
                    content_dna=content_dna,
                    platform=platform,
                    voice_profile=voice_profile,
                    raw_content=content_upload.raw_content,
                    emphasis_notes=emphasis_notes,
                )

                # Score voice match if a voice profile is provided
                voice_score = None
                if voice_profile and result.get("content"):
                    voice_score = await self.score_voice_match(
                        generated_content=result["content"],
                        voice_profile=voice_profile,
                    )

                # Build metadata
                metadata = result.get("metadata", {})
                metadata["platform_fit_score"] = self.evaluate_platform_fit(
                    content_dna, platform
                )

                output = GeneratedOutput(
                    content_upload_id=content_upload.id,
                    platform_id=platform.platform_id,
                    format_name=platform.name,
                    content=result.get("content", ""),
                    metadata=metadata,
                    voice_match_score=voice_score,
                    status="draft",
                )
                db.add(output)
                generated_outputs.append(output)

            except Exception as e:
                logger.error(
                    "Failed to generate output for platform %s: %s",
                    platform.platform_id,
                    str(e),
                )
                # Create a failed output record so the user knows what happened
                output = GeneratedOutput(
                    content_upload_id=content_upload.id,
                    platform_id=platform.platform_id,
                    format_name=platform.name,
                    content="",
                    metadata={"error": str(e)},
                    voice_match_score=None,
                    status="failed",
                )
                db.add(output)
                generated_outputs.append(output)

        # Update ContentUpload status to completed
        content_upload.status = "completed"
        await db.flush()

        # Refresh all outputs to get their generated IDs
        for output in generated_outputs:
            await db.refresh(output)

        return generated_outputs

    async def generate_single_output(
        self,
        content_dna: dict,
        platform: PlatformProfile,
        voice_profile: BrandVoiceProfile | None,
        raw_content: str,
        emphasis_notes: str | None = None,
    ) -> dict:
        """Generate a single platform output via Claude.

        Args:
            content_dna: The content DNA card dict.
            platform: The target platform profile.
            voice_profile: Optional brand voice profile.
            raw_content: The original raw content text.
            emphasis_notes: Optional creator direction notes.

        Returns:
            Dict with 'content' (str) and 'metadata' (dict) keys.
        """
        client = _get_client()
        if client is None:
            logger.warning(
                "ANTHROPIC_API_KEY not configured; returning placeholder for %s",
                platform.platform_id,
            )
            return {
                "content": (
                    f"[AI generation unavailable — ANTHROPIC_API_KEY not configured]\n\n"
                    f"Platform: {platform.name}\n"
                    f"Core idea: {content_dna.get('core_idea', 'N/A')}"
                ),
                "metadata": {
                    "error": "ANTHROPIC_API_KEY not configured",
                    "platform_id": platform.platform_id,
                },
            }

        prompt = self._build_generation_prompt(
            content_dna=content_dna,
            platform=platform,
            voice_profile=voice_profile,
            raw_content=raw_content,
            emphasis_notes=emphasis_notes,
        )

        try:
            # Use a higher max_tokens for long-form formats
            max_tokens = 4096
            if platform.platform_id in (
                "youtube_longform",
                "blog_seo",
                "slide_deck",
                "podcast_talking_points",
            ):
                max_tokens = 6000

            message = await client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )

            generated_content = message.content[0].text.strip()

            return {
                "content": generated_content,
                "metadata": {
                    "platform_id": platform.platform_id,
                    "model": "claude-sonnet-4-20250514",
                    "input_tokens": message.usage.input_tokens,
                    "output_tokens": message.usage.output_tokens,
                },
            }

        except anthropic.APIError as e:
            logger.error(
                "Anthropic API error generating %s output: %s",
                platform.platform_id,
                str(e),
            )
            return {
                "content": "",
                "metadata": {
                    "error": f"API error: {str(e)}",
                    "platform_id": platform.platform_id,
                },
            }
        except Exception as e:
            logger.error(
                "Unexpected error generating %s output: %s",
                platform.platform_id,
                str(e),
            )
            return {
                "content": "",
                "metadata": {
                    "error": f"Unexpected error: {str(e)}",
                    "platform_id": platform.platform_id,
                },
            }

    async def score_voice_match(
        self,
        generated_content: str,
        voice_profile: BrandVoiceProfile,
    ) -> float:
        """Score 0-100 how well the output matches the creator's voice.

        Calls Claude with a focused prompt comparing the generated content
        against the voice profile attributes. Returns a numeric score.
        """
        client = _get_client()
        if client is None:
            logger.warning("ANTHROPIC_API_KEY not configured; returning default voice score")
            return 50.0

        # Build voice description for comparison
        voice_attrs = voice_profile.voice_attributes or []
        tone_metrics = voice_profile.tone_metrics or {}
        vocabulary = voice_profile.vocabulary or {}

        prompt = f"""You are a voice consistency analyst. Compare the following generated content against the creator's voice profile and score how well it matches.

## Generated Content
{generated_content[:3000]}

## Creator's Voice Profile
Voice Attributes: {', '.join(voice_attrs) if voice_attrs else 'Not specified'}
Tone Metrics: {json.dumps(tone_metrics, indent=2) if tone_metrics else 'Not specified'}
Vocabulary Patterns: {json.dumps(vocabulary, indent=2) if vocabulary else 'Not specified'}
Signature Phrases: {json.dumps(voice_profile.formatting_config.get('signature_phrases', []) if voice_profile.formatting_config else [], indent=2)}

## Scoring Criteria
- Tone alignment (does it sound like this person?) — 30 points
- Vocabulary match (uses their preferred words, avoids their banned terms) — 25 points
- Sentence structure (matches their typical rhythm and length) — 20 points
- Personality consistency (captures their unique perspective and energy) — 15 points
- CTA style match (uses CTAs consistent with their brand) — 10 points

Return ONLY a JSON object with this structure:
{{"score": <0-100>, "breakdown": {{"tone": <0-30>, "vocabulary": <0-25>, "structure": <0-20>, "personality": <0-15>, "cta": <0-10>}}, "notes": "<brief explanation>"}}"""

        try:
            message = await client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=512,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = message.content[0].text
            result = _extract_json_from_response(response_text)
            score = result.get("score", 50.0)
            return max(0.0, min(100.0, float(score)))

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.error("Failed to parse voice match score: %s", str(e))
            return 50.0
        except anthropic.APIError as e:
            logger.error("API error during voice scoring: %s", str(e))
            return 50.0
        except Exception as e:
            logger.error("Unexpected error during voice scoring: %s", str(e))
            return 50.0

    def _build_generation_prompt(
        self,
        content_dna: dict,
        platform: PlatformProfile,
        voice_profile: BrandVoiceProfile | None,
        raw_content: str,
        emphasis_notes: str | None,
    ) -> str:
        """Build the full generation prompt for Claude.

        This is the key prompt engineering method. It assembles context from
        the content DNA, platform profile, and voice profile into a detailed
        instruction set for Claude.
        """
        # --- Format content DNA sections ---
        core_idea = content_dna.get("core_idea", "Not available")

        key_points = content_dna.get("key_points", [])
        formatted_key_points = ""
        for i, kp in enumerate(key_points, 1):
            point = kp.get("point", "") if isinstance(kp, dict) else str(kp)
            strength = kp.get("strength", "N/A") if isinstance(kp, dict) else "N/A"
            formatted_key_points += f"  {i}. {point} (strength: {strength})\n"
        if not formatted_key_points:
            formatted_key_points = "  No key points extracted.\n"

        hooks = content_dna.get("best_hooks", [])
        formatted_hooks = ""
        for i, hook in enumerate(hooks, 1):
            hook_text = hook.get("hook", "") if isinstance(hook, dict) else str(hook)
            hook_type = hook.get("hook_type", "general") if isinstance(hook, dict) else "general"
            formatted_hooks += f"  {i}. [{hook_type}] {hook_text}\n"
        if not formatted_hooks:
            formatted_hooks = "  No hooks extracted.\n"

        quotes = content_dna.get("quotable_moments", [])
        formatted_quotes = ""
        for i, q in enumerate(quotes, 1):
            formatted_quotes += f"  {i}. \"{q}\"\n"
        if not formatted_quotes:
            formatted_quotes = "  No quotable moments extracted.\n"

        # --- Format platform section ---
        templates_str = "\n".join(
            f"  - {t}" for t in platform.structural_templates
        )
        cta_str = "\n".join(f"  - {c}" for c in platform.cta_styles)

        # --- Format voice section ---
        voice_section = ""
        if voice_profile:
            voice_attrs = voice_profile.voice_attributes or []
            tone_metrics = voice_profile.tone_metrics or {}
            vocabulary = voice_profile.vocabulary or {}
            topic_boundaries = voice_profile.topic_boundaries or {}
            cta_library = voice_profile.cta_library or []

            banned_terms = vocabulary.get("banned_terms", [])
            preferred_terms = vocabulary.get("preferred_terms", [])
            common_words = vocabulary.get("common_words", [])
            audience_label = vocabulary.get("audience_label", "")

            voice_section = f"""
## Creator's Voice
Voice Attributes: {', '.join(voice_attrs) if voice_attrs else 'Natural, authentic'}
Tone Metrics:
  Formality: {tone_metrics.get('formality', 0.5)}/1.0
  Humor: {tone_metrics.get('humor', 0.5)}/1.0
  Vulnerability: {tone_metrics.get('vulnerability', 0.5)}/1.0
  Directness: {tone_metrics.get('directness', 0.5)}/1.0
  Jargon Density: {tone_metrics.get('jargon_density', 0.5)}/1.0
Preferred Terms: {', '.join(preferred_terms) if preferred_terms else 'None specified'}
Banned Terms (NEVER use): {', '.join(banned_terms) if banned_terms else 'None specified'}
Common Words: {', '.join(common_words[:15]) if common_words else 'None specified'}
Audience Label: {audience_label if audience_label else 'Not specified'}
CTA Library: {', '.join(cta_library[:5]) if cta_library else 'Use platform-native CTAs'}
Approved Topics: {', '.join(topic_boundaries.get('approved_topics', [])) if topic_boundaries.get('approved_topics') else 'No restrictions'}
Restricted Topics (AVOID): {', '.join(topic_boundaries.get('restricted_topics', [])) if topic_boundaries.get('restricted_topics') else 'None'}
"""
        else:
            voice_section = """
## Creator's Voice
No specific voice profile provided. Use a natural, professional, engaging tone that matches the platform's native style.
"""

        # --- Format emphasis notes ---
        emphasis_section = ""
        if emphasis_notes:
            emphasis_section = f"""
## Additional Direction from Creator
{emphasis_notes}
"""

        # --- Build format-specific instructions ---
        format_instructions = self._get_format_specific_instructions(platform)

        # --- Truncate raw content for context ---
        raw_excerpt = raw_content[:5000] if len(raw_content) > 5000 else raw_content

        # --- Assemble the full prompt ---
        prompt = f"""You are a world-class content strategist creating a {platform.name} post.

Your job is to transform the source content analysis into a platform-optimized piece that stands completely on its own, matches the creator's voice, and is engineered for maximum performance on {platform.name}.

## Source Content Analysis
Core Idea: {core_idea}

Key Points:
{formatted_key_points}
Best Hooks:
{formatted_hooks}
Quotable Moments:
{formatted_quotes}

## Original Content Excerpt (for additional context)
{raw_excerpt}

## Platform Requirements
Platform: {platform.name}
Native Tone: {platform.native_tone}
Length: Target {platform.length_range.ideal} characters (minimum {platform.length_range.min}, maximum {platform.length_range.max})
Structural Templates:
{templates_str}
Algorithm Optimization: Content performs best when it drives {platform.algorithm_signals.primary}. Secondary signal: {platform.algorithm_signals.secondary}. Avoid: {platform.algorithm_signals.negative}
CTA Styles:
{cta_str}
Audience Intent: {platform.audience_intent}
{voice_section}{emphasis_section}
## Generation Rules
1. The output MUST be completely standalone — it delivers full value without reading the original content
2. Match the creator's voice exactly (if a voice profile is provided)
3. Optimize for {platform.name}'s algorithm and audience intent
4. Stay within the character/word limits: target {platform.length_range.ideal}, max {platform.length_range.max} characters
5. Use the strongest hook from the source content, adapted for this platform's native style
6. Include a natural, platform-appropriate CTA
7. Do NOT mention that this was generated from another piece of content
8. Do NOT use generic filler — every sentence must earn its place
{format_instructions}

Generate the {platform.name} content now. Return ONLY the post content — no explanations, no metadata, no commentary."""

        return prompt

    def _get_format_specific_instructions(self, platform: PlatformProfile) -> str:
        """Return format-specific output instructions based on the platform type."""
        instructions: dict[str, str] = {
            "twitter_thread": """
## Format-Specific Instructions
Return numbered tweets separated by lines containing only `---`. Example:
1/ Hook tweet here

---

2/ Second tweet with insight

---

3/ Final tweet with CTA

Each tweet must be under 280 characters. The hook tweet (1/) is the most important — it determines whether anyone reads the rest.""",

            "instagram_carousel": """
## Format-Specific Instructions
Return slide-by-slide content with `[Slide N]` markers. Example:
[Slide 1]
HOOK: Bold headline text
Subtext: Supporting line

[Slide 2]
HEADLINE: Tip or point title
Body: 1-2 sentences max

...

[Slide N]
CTA: Call to action text
Follow @handle for more

Keep each slide to 1-2 short sentences maximum. The first slide is the hook — it must stop the scroll. The last slide is always a CTA.""",

            "youtube_longform": """
## Format-Specific Instructions
Return a structured video script with clear section markers:
[HOOK]
The first 8 seconds of the video — must immediately grab attention.

[INTRO]
Context and preview of what the viewer will learn (30 seconds).

[SECTION 1: Title]
Main talking points for this section.
[B-ROLL: Description of suggested visual]

[SECTION 2: Title]
...continue for each main section...

[CTA]
Subscribe/engagement call to action.

[OUTRO]
Brief closing with endscreen reference.

[TIMESTAMPS]
0:00 - Hook
0:08 - Intro
...

[THUMBNAIL IDEAS]
2-3 thumbnail text/concept suggestions.""",

            "short_form_video": """
## Format-Specific Instructions
Return a teleprompter-style script with visual cues. Example:
[HOOK — 0:00-0:02]
(Look directly at camera)
"Opening line that stops the scroll"

[CONTEXT — 0:02-0:07]
[VISUAL: text overlay with key stat]
"Brief context setting"

[VALUE — 0:07-0:45]
[VISUAL: numbered list appearing on screen]
"Main content delivered conversationally"

[CTA — 0:45-0:55]
"Closing call to action"
[VISUAL: Follow button animation]

Keep the total script under 60 seconds. Write in a conversational, spoken-word style.""",

            "email_newsletter": """
## Format-Specific Instructions
Return with these clearly labeled sections:
SUBJECT: The email subject line (50 chars max, curiosity-driven)

PREVIEW: Preview text that appears in inbox (90 chars max)

BODY:
The full email body. Open with a personal hook, deliver value in the middle,
close with a clear CTA. Use short paragraphs (2-3 sentences max).
Include a PS line at the end — it's the second most-read part of any email.""",

            "slide_deck": """
## Format-Specific Instructions
Return with clear slide markers and speaker notes:
[Slide 1: Title Slide]
Title: Presentation title
Subtitle: Tagline or date
Speaker Notes: Brief opening remarks

[Slide 2: Agenda/Overview]
- Point 1
- Point 2
- Point 3
Speaker Notes: How to introduce the structure

[Slide 3: Section Title]
Key Point: One bold statement
Supporting: 1-2 bullet points max
Speaker Notes: Full talking points for this slide (2-3 paragraphs)

...continue for 10-15 slides...

[Slide N: Key Takeaways]
1. Takeaway one
2. Takeaway two
3. Takeaway three
Speaker Notes: How to summarize and transition to Q&A

Keep slide text minimal (6 words per line, 6 lines max). Put the detail in Speaker Notes.""",

            "press_release": """
## Format-Specific Instructions
Return in AP-style press release format:
FOR IMMEDIATE RELEASE

HEADLINE: Clear, factual headline

SUBHEADLINE: Supporting detail

DATELINE, Month Day, Year — Lead paragraph answering Who, What, When, Where, Why.

Second paragraph with supporting details and context.

"Quote from relevant person about the significance of this news," said [Name], [Title] at [Organization].

Additional context paragraph with data or background.

### About [Organization]
Boilerplate description (2-3 sentences about the organization).

### Media Contact
[Name]
[Email]
[Phone]

###

Write in third person, factual tone. No promotional superlatives.""",

            "podcast_talking_points": """
## Format-Specific Instructions
Return a structured episode outline:
EPISODE TITLE: Compelling episode name

COLD OPEN:
Brief teaser quote or hook to play before the intro (15-30 seconds of content).

INTRO:
How to introduce today's topic (2-3 sentences).

SEGMENT 1: [Segment Title]
- Talking point 1: Key idea to discuss
- Talking point 2: Supporting story or data
- Transition: How to move to next segment

SEGMENT 2: [Segment Title]
- Talking point 1: ...
- Talking point 2: ...
- Transition: ...

...(3-5 segments total)...

LISTENER ENGAGEMENT:
Question to pose to the audience or call for feedback.

OUTRO:
- Key takeaway summary (1-2 sentences)
- Preview of next episode (if applicable)
- CTA: Subscribe/review/share

SHOW NOTES:
- Key resources mentioned
- Links to reference material""",
        }

        return instructions.get(platform.platform_id, "")
