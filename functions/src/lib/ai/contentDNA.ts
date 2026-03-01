/**
 * Content DNA card generation — port of apps/api/app/services/ai.py analyze_content_dna.
 */

import { getAnthropic } from "../../config/anthropic.js";
import { getStandardSystem } from "./cognitiveArchitect.js";

function extractJsonFromResponse(text: string): Record<string, unknown> {
  // Try code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?(.*?)\n?\s*```/s);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }
  // Try raw JSON
  const braceMatch = text.match(/\{.*\}/s);
  if (braceMatch) {
    return JSON.parse(braceMatch[0]);
  }
  return JSON.parse(text.trim());
}

const EMPTY_DNA = {
  core_idea: "",
  key_points: [],
  best_hooks: [],
  quotable_moments: [],
  emotional_arc: [],
  content_type_classification: "unknown",
  suggested_platforms: [],
};

function sanitizeDNA(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    core_idea: typeof raw.core_idea === "string" ? raw.core_idea : "",
    key_points: Array.isArray(raw.key_points) ? raw.key_points : [],
    best_hooks: Array.isArray(raw.best_hooks) ? raw.best_hooks : [],
    quotable_moments: Array.isArray(raw.quotable_moments) ? raw.quotable_moments : [],
    emotional_arc: Array.isArray(raw.emotional_arc) ? raw.emotional_arc : [],
    content_type_classification:
      typeof raw.content_type_classification === "string"
        ? raw.content_type_classification
        : "unknown",
    suggested_platforms: Array.isArray(raw.suggested_platforms) ? raw.suggested_platforms : [],
  };
}

function getContentTypeHint(contentType: string): string {
  switch (contentType) {
    case "video_transcript":
      return "\n\nThis is a video transcript. Pay attention to speaker cadence, visual cue mentions, and moments that would work as video clips.";
    case "podcast_transcript":
      return "\n\nThis is a podcast transcript. Emphasize conversational hooks, guest quotes, and back-and-forth exchanges that reveal strong opinions.";
    case "blog":
      return "\n\nThis is a blog post. Emphasize written structure, SEO-friendly hooks, and key takeaways that can stand alone as social snippets.";
    default:
      return "";
  }
}

export async function analyzeContentDNA(
  content: string,
  contentType: string,
  title: string
): Promise<Record<string, unknown>> {
  const anthropic = getAnthropic();

  const contentTypeHint = getContentTypeHint(contentType);

  const prompt = `Analyze the following ${contentType} content titled "${title}" and produce a Content DNA Card as structured JSON.${contentTypeHint}

Return ONLY valid JSON (no explanation or markdown) with exactly these fields:

{
  "core_idea": "<one-sentence summary of the core idea>",
  "key_points": [
    {"point": "<key insight>", "strength": <0.0-1.0>, "description": "<brief explanation>"}
  ],
  "best_hooks": [
    {"hook": "<attention-grabbing opening line>", "hook_type": "<question|statistic|story|bold_claim|contrarian>", "platform_fit": ["<platform_id>"]}
  ],
  "quotable_moments": ["<standalone quote or stat>"],
  "emotional_arc": [
    {"segment": "<beginning|middle|end>", "tone": "<descriptive tone>", "intensity": <0.0-1.0>}
  ],
  "content_type_classification": "<thought_leadership|how_to|case_study|opinion|announcement|personal_story>",
  "suggested_platforms": [
    {"platform_id": "<twitter|linkedin|instagram|threads|tiktok|youtube|newsletter>", "platform_name": "<display name>", "fit_score": <0.0-1.0>, "reason": "<why this content fits>"}
  ]
}

Requirements:
- key_points: 3-5 items, strength is a relevance/impact score from 0 to 1
- best_hooks: 3-5 items, each optimized for specific platforms
- quotable_moments: 3-8 standalone quotes, statistics, or memorable phrases
- emotional_arc: 3-5 segments tracking the emotional journey
- suggested_platforms: 3-6 platforms ranked by fit

CONTENT:
${content.substring(0, 15000)}`;

  try {
    const { system } = getStandardSystem("content_analyst");
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    return sanitizeDNA(extractJsonFromResponse(responseText));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Content DNA analysis error:", errorMsg);
    return { ...EMPTY_DNA, error: errorMsg };
  }
}

export async function analyzeVoiceSamples(
  samples: string[]
): Promise<Record<string, unknown>> {
  const anthropic = getAnthropic();

  const combinedSamples = samples.join("\n\n---SAMPLE BREAK---\n\n");

  const prompt = `Analyze the following writing samples to extract the author's voice characteristics and writing style.

Return ONLY valid JSON (no explanation or markdown) with exactly these fields:

{
  "tone_metrics": {
    "formality": <0.0-1.0>,
    "humor": <0.0-1.0>,
    "vulnerability": <0.0-1.0>,
    "directness": <0.0-1.0>,
    "jargon_density": <0.0-1.0>
  },
  "vocabulary_patterns": {
    "common_words": ["<frequently used words>"],
    "sentence_starters": ["<common ways sentences begin>"],
    "transitions": ["<common transition phrases>"],
    "emphasis_patterns": ["<how the author emphasizes points>"]
  },
  "avg_sentence_length": <average number of words per sentence>,
  "active_voice_ratio": <0.0-1.0>,
  "signature_phrases": ["<distinctive phrases or expressions unique to this author>"],
  "suggested_attributes": ["<3-5 adjective descriptors for this voice>"]
}

WRITING SAMPLES:
${combinedSamples.substring(0, 15000)}`;

  try {
    const { system } = getStandardSystem("voice_analyst");
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    return extractJsonFromResponse(responseText);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Voice analysis error:", errorMsg);
    return {
      tone_metrics: { formality: 0.5, humor: 0.5, vulnerability: 0.5, directness: 0.5, jargon_density: 0.5 },
      vocabulary_patterns: {},
      avg_sentence_length: 0,
      active_voice_ratio: 0.5,
      signature_phrases: [],
      error: errorMsg,
    };
  }
}
