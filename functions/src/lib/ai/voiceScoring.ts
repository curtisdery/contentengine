/**
 * Voice match scoring (0-100) — port of TransformationEngine.score_voice_match.
 */

import { getAnthropic } from "../../config/anthropic.js";
import type { BrandVoiceProfileDoc } from "../../shared/types.js";

function extractJsonFromResponse(text: string): Record<string, unknown> {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?(.*?)\n?\s*```/s);
  if (codeBlockMatch) return JSON.parse(codeBlockMatch[1].trim());
  const braceMatch = text.match(/\{.*\}/s);
  if (braceMatch) return JSON.parse(braceMatch[0]);
  return JSON.parse(text.trim());
}

export async function scoreVoiceMatch(
  generatedContent: string,
  voiceProfile: BrandVoiceProfileDoc
): Promise<number> {
  const anthropic = getAnthropic();

  const voiceAttrs = voiceProfile.voiceAttributes || [];
  const toneMetrics = voiceProfile.toneMetrics || {};
  const vocabulary = voiceProfile.vocabulary || {};
  const signaturePhrases = (voiceProfile.formattingConfig?.signature_phrases as string[]) ?? [];

  const prompt = `You are a voice consistency analyst. Compare the following generated content against the creator's voice profile and score how well it matches.

## Generated Content
${generatedContent.substring(0, 3000)}

## Creator's Voice Profile
Voice Attributes: ${voiceAttrs.join(", ") || "Not specified"}
Tone Metrics: ${JSON.stringify(toneMetrics, null, 2) || "Not specified"}
Vocabulary Patterns: ${JSON.stringify(vocabulary, null, 2) || "Not specified"}
Signature Phrases: ${JSON.stringify(signaturePhrases, null, 2)}

## Scoring Criteria
- Tone alignment (does it sound like this person?) — 30 points
- Vocabulary match (uses their preferred words, avoids their banned terms) — 25 points
- Sentence structure (matches their typical rhythm and length) — 20 points
- Personality consistency (captures their unique perspective and energy) — 15 points
- CTA style match (uses CTAs consistent with their brand) — 10 points

Return ONLY a JSON object with this structure:
{"score": <0-100>, "breakdown": {"tone": <0-30>, "vocabulary": <0-25>, "structure": <0-20>, "personality": <0-15>, "cta": <0-10>}, "notes": "<brief explanation>"}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    const result = extractJsonFromResponse(responseText);
    const score = Number(result.score ?? 50);
    return Math.max(0, Math.min(100, score));
  } catch (err) {
    console.error("Voice scoring error:", err instanceof Error ? err.message : err);
    return 50.0;
  }
}
