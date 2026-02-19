"""Claude AI integration service for content analysis and voice profiling."""

import json
import logging
import re

import anthropic

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


def _get_client() -> anthropic.AsyncAnthropic | None:
    """Create an AsyncAnthropic client if the API key is configured."""
    if not settings.ANTHROPIC_API_KEY:
        return None
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


def _extract_json_from_response(text: str) -> dict:
    """Extract JSON from Claude's response text, handling markdown code blocks."""
    # Try to find JSON in a code block first
    code_block_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if code_block_match:
        json_str = code_block_match.group(1).strip()
    else:
        # Try to find raw JSON (starts with { and ends with })
        brace_match = re.search(r"\{.*\}", text, re.DOTALL)
        if brace_match:
            json_str = brace_match.group(0)
        else:
            json_str = text.strip()

    return json.loads(json_str)


async def analyze_content_dna(content: str, content_type: str, title: str) -> dict:
    """Call Claude to generate a Content DNA Card from the provided content.

    Args:
        content: The cleaned text content to analyze.
        content_type: One of 'blog', 'video_transcript', 'podcast_transcript'.
        title: The title of the content piece.

    Returns:
        A dict containing the Content DNA Card structure.
    """
    client = _get_client()
    if client is None:
        logger.warning("ANTHROPIC_API_KEY not configured; returning empty DNA card")
        return {
            "core_idea": "AI analysis unavailable — API key not configured",
            "key_points": [],
            "best_hooks": [],
            "quotable_moments": [],
            "emotional_arc": [],
            "content_type_classification": "unknown",
            "suggested_platforms": [],
            "error": "ANTHROPIC_API_KEY not configured",
        }

    prompt = f"""Analyze the following {content_type} content titled "{title}" and produce a Content DNA Card as structured JSON.

Return ONLY valid JSON (no explanation or markdown) with exactly these fields:

{{
  "core_idea": "<one-sentence summary of the core idea>",
  "key_points": [
    {{"point": "<key insight>", "strength": <0.0-1.0>, "description": "<brief explanation>"}}
  ],
  "best_hooks": [
    {{"hook": "<attention-grabbing opening line>", "hook_type": "<question|statistic|story|bold_claim|contrarian>", "platform_fit": ["<platform_id>"]}}
  ],
  "quotable_moments": ["<standalone quote or stat>"],
  "emotional_arc": [
    {{"segment": "<beginning|middle|end>", "tone": "<descriptive tone>", "intensity": <0.0-1.0>}}
  ],
  "content_type_classification": "<thought_leadership|how_to|case_study|opinion|announcement|personal_story>",
  "suggested_platforms": [
    {{"platform_id": "<twitter|linkedin|instagram|threads|tiktok|youtube|newsletter>", "platform_name": "<display name>", "fit_score": <0.0-1.0>, "reason": "<why this content fits>"}}
  ]
}}

Requirements:
- key_points: 3-5 items, strength is a relevance/impact score from 0 to 1
- best_hooks: 3-5 items, each optimized for specific platforms
- quotable_moments: 3-8 standalone quotes, statistics, or memorable phrases
- emotional_arc: 3-5 segments tracking the emotional journey
- suggested_platforms: 3-6 platforms ranked by fit

CONTENT:
{content[:15000]}"""

    try:
        message = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text
        return _extract_json_from_response(response_text)

    except json.JSONDecodeError as e:
        logger.error("Failed to parse AI response as JSON: %s", str(e))
        return {
            "core_idea": "Analysis completed but response parsing failed",
            "key_points": [],
            "best_hooks": [],
            "quotable_moments": [],
            "emotional_arc": [],
            "content_type_classification": "unknown",
            "suggested_platforms": [],
            "error": f"JSON parse error: {str(e)}",
        }
    except anthropic.APIError as e:
        logger.error("Anthropic API error during content DNA analysis: %s", str(e))
        return {
            "core_idea": "AI analysis failed due to API error",
            "key_points": [],
            "best_hooks": [],
            "quotable_moments": [],
            "emotional_arc": [],
            "content_type_classification": "unknown",
            "suggested_platforms": [],
            "error": f"API error: {str(e)}",
        }
    except Exception as e:
        logger.error("Unexpected error during content DNA analysis: %s", str(e))
        return {
            "core_idea": "AI analysis failed due to unexpected error",
            "key_points": [],
            "best_hooks": [],
            "quotable_moments": [],
            "emotional_arc": [],
            "content_type_classification": "unknown",
            "suggested_platforms": [],
            "error": f"Unexpected error: {str(e)}",
        }


async def analyze_voice_samples(samples: list[str]) -> dict:
    """Call Claude to analyze writing samples and extract voice characteristics.

    Args:
        samples: A list of 1-5 content samples to analyze.

    Returns:
        A dict containing tone metrics, vocabulary patterns, and signature phrases.
    """
    client = _get_client()
    if client is None:
        logger.warning("ANTHROPIC_API_KEY not configured; returning empty voice analysis")
        return {
            "tone_metrics": {
                "formality": 0.5,
                "humor": 0.5,
                "vulnerability": 0.5,
                "directness": 0.5,
                "jargon_density": 0.5,
            },
            "vocabulary_patterns": {},
            "avg_sentence_length": 0,
            "active_voice_ratio": 0.5,
            "signature_phrases": [],
            "error": "ANTHROPIC_API_KEY not configured",
        }

    combined_samples = "\n\n---SAMPLE BREAK---\n\n".join(samples)

    prompt = f"""Analyze the following writing samples to extract the author's voice characteristics and writing style.

Return ONLY valid JSON (no explanation or markdown) with exactly these fields:

{{
  "tone_metrics": {{
    "formality": <0.0-1.0, where 0 is very casual and 1 is very formal>,
    "humor": <0.0-1.0, where 0 is no humor and 1 is very humorous>,
    "vulnerability": <0.0-1.0, where 0 is guarded and 1 is very open/vulnerable>,
    "directness": <0.0-1.0, where 0 is indirect/hedging and 1 is very direct>,
    "jargon_density": <0.0-1.0, where 0 is plain language and 1 is heavy jargon>
  }},
  "vocabulary_patterns": {{
    "common_words": ["<frequently used words>"],
    "sentence_starters": ["<common ways sentences begin>"],
    "transitions": ["<common transition phrases>"],
    "emphasis_patterns": ["<how the author emphasizes points>"]
  }},
  "avg_sentence_length": <average number of words per sentence>,
  "active_voice_ratio": <0.0-1.0, proportion of active voice sentences>,
  "signature_phrases": ["<distinctive phrases or expressions unique to this author>"],
  "suggested_attributes": ["<3-5 adjective descriptors for this voice, e.g. bold, warm, direct>"]
}}

WRITING SAMPLES:
{combined_samples[:15000]}"""

    try:
        message = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text
        return _extract_json_from_response(response_text)

    except json.JSONDecodeError as e:
        logger.error("Failed to parse AI voice analysis response as JSON: %s", str(e))
        return {
            "tone_metrics": {
                "formality": 0.5,
                "humor": 0.5,
                "vulnerability": 0.5,
                "directness": 0.5,
                "jargon_density": 0.5,
            },
            "vocabulary_patterns": {},
            "avg_sentence_length": 0,
            "active_voice_ratio": 0.5,
            "signature_phrases": [],
            "error": f"JSON parse error: {str(e)}",
        }
    except anthropic.APIError as e:
        logger.error("Anthropic API error during voice analysis: %s", str(e))
        return {
            "tone_metrics": {
                "formality": 0.5,
                "humor": 0.5,
                "vulnerability": 0.5,
                "directness": 0.5,
                "jargon_density": 0.5,
            },
            "vocabulary_patterns": {},
            "avg_sentence_length": 0,
            "active_voice_ratio": 0.5,
            "signature_phrases": [],
            "error": f"API error: {str(e)}",
        }
    except Exception as e:
        logger.error("Unexpected error during voice analysis: %s", str(e))
        return {
            "tone_metrics": {
                "formality": 0.5,
                "humor": 0.5,
                "vulnerability": 0.5,
                "directness": 0.5,
                "jargon_density": 0.5,
            },
            "vocabulary_patterns": {},
            "avg_sentence_length": 0,
            "active_voice_ratio": 0.5,
            "signature_phrases": [],
            "error": f"Unexpected error: {str(e)}",
        }
