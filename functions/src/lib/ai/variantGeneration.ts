/**
 * A/B test variant generation — creates two distinct content variants
 * for the same source content, differing in hook, tone, or angle.
 */

import { getAnthropic } from "../../config/anthropic.js";
import type { ContentDNA, BrandVoiceProfileDoc } from "../../shared/types.js";
import type { PlatformProfile } from "../platforms/profiles.js";
import { getCondensedSystem } from "./cognitiveArchitect.js";

export interface VariantPair {
  variantA: { content: string; label: string; hookType: string };
  variantB: { content: string; label: string; hookType: string };
  hypothesis: string;
}

/**
 * Generate two content variants for the same platform, varying the hook strategy.
 * Uses the content DNA's bestHooks to create meaningful variations.
 */
export async function generateVariantPair(
  contentDna: ContentDNA,
  platform: PlatformProfile,
  voiceProfile: BrandVoiceProfileDoc | null,
  rawContent: string
): Promise<VariantPair> {
  const anthropic = getAnthropic();
  const hooks = contentDna.bestHooks || [];

  // Select two different hooks to test
  const hookA = hooks[0] || { hook: "direct statement", hookType: "bold_claim" };
  const hookB = hooks[1] || { hook: "engaging question", hookType: "question" };

  const voiceContext = voiceProfile
    ? `Voice: ${voiceProfile.voiceAttributes.join(", ")}. Formality: ${voiceProfile.toneMetrics?.formality ?? 0.5}/1.0.`
    : "Use a natural, engaging tone.";

  const prompt = `Generate TWO distinct variants of a ${platform.name} post from the same source content.

## Source Content
Core Idea: ${contentDna.coreIdea}
Key Points: ${contentDna.keyPoints.map((kp) => kp.point).join("; ")}

## Raw Content (excerpt)
${rawContent.substring(0, 3000)}

## Platform
${platform.name} — target length ${platform.lengthRange.ideal} chars, max ${platform.lengthRange.max} chars.

## Voice
${voiceContext}

## Variant A: "${hookA.hookType}" hook approach
Use this hook style: ${hookA.hook}
Lead with a ${hookA.hookType} opening.

## Variant B: "${hookB.hookType}" hook approach
Use this hook style: ${hookB.hook}
Lead with a ${hookB.hookType} opening.

Return ONLY valid JSON in this exact format:
{
  "variantA": "the full post content for variant A",
  "variantB": "the full post content for variant B"
}`;

  const { system } = getCondensedSystem("content_strategist");
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";

  let parsed: { variantA?: string; variantB?: string };
  try {
    parsed = JSON.parse(responseText);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[1].trim()) : {};
  }

  return {
    variantA: {
      content: parsed.variantA || "",
      label: `Hook: ${hookA.hookType}`,
      hookType: hookA.hookType,
    },
    variantB: {
      content: parsed.variantB || "",
      label: `Hook: ${hookB.hookType}`,
      hookType: hookB.hookType,
    },
    hypothesis: `Testing whether "${hookA.hookType}" hooks outperform "${hookB.hookType}" hooks on ${platform.name}`,
  };
}
