/**
 * Quality Gate — runs before an output moves from draft to approved.
 * Checks predictive score, platform compliance, and content quality.
 */

import type { ContentDNA } from "../../shared/types.js";
import { predictContentScore } from "../analytics/contentScoring.js";

export interface QualityGateResult {
  passed: boolean;
  overallScore: number;
  checks: QualityCheck[];
  recommendation: string | null;
}

interface QualityCheck {
  name: string;
  passed: boolean;
  score: number;
  message: string;
}

// Platform character limits
const PLATFORM_LIMITS: Record<string, { min: number; max: number }> = {
  twitter_single: { min: 10, max: 280 },
  twitter_thread: { min: 50, max: 5000 },
  linkedin_post: { min: 50, max: 3000 },
  linkedin_article: { min: 500, max: 50000 },
  bluesky_post: { min: 10, max: 300 },
  instagram_carousel: { min: 50, max: 5000 },
  instagram_caption: { min: 20, max: 2200 },
  youtube_longform: { min: 500, max: 20000 },
  short_form_video: { min: 50, max: 2000 },
  email_newsletter: { min: 200, max: 5000 },
  reddit_post: { min: 50, max: 10000 },
  quora_answer: { min: 100, max: 5000 },
  blog_seo: { min: 800, max: 15000 },
  medium_post: { min: 500, max: 10000 },
  pinterest_pin: { min: 20, max: 500 },
  press_release: { min: 300, max: 5000 },
  slide_deck: { min: 200, max: 10000 },
  podcast_talking_points: { min: 200, max: 5000 },
};

// Known low-quality patterns
const FILLER_PHRASES = [
  "in today's fast-paced world",
  "let's dive in",
  "game-changer",
  "revolutionary",
  "cutting-edge",
  "without further ado",
  "at the end of the day",
  "it goes without saying",
];

/**
 * Run quality gate checks on a generated output.
 * Returns pass/fail with detailed check results and recommendations.
 */
export async function runQualityGate(
  workspaceId: string,
  platformId: string,
  content: string,
  contentDna: ContentDNA,
  voiceMatchScore: number | null,
  platformFitScore: number | null
): Promise<QualityGateResult> {
  const checks: QualityCheck[] = [];

  // Check 1: Platform length compliance
  const limits = PLATFORM_LIMITS[platformId];
  if (limits) {
    const len = content.length;
    const withinLimits = len >= limits.min && len <= limits.max;
    checks.push({
      name: "length_compliance",
      passed: withinLimits,
      score: withinLimits ? 1 : (len < limits.min ? len / limits.min : limits.max / len),
      message: withinLimits
        ? `Content length (${len} chars) is within platform limits`
        : `Content length (${len} chars) is outside platform limits (${limits.min}-${limits.max})`,
    });
  }

  // Check 2: Filler phrase detection
  const contentLower = content.toLowerCase();
  const foundFillers = FILLER_PHRASES.filter((phrase) => contentLower.includes(phrase));
  checks.push({
    name: "filler_detection",
    passed: foundFillers.length === 0,
    score: Math.max(0, 1 - foundFillers.length * 0.3),
    message: foundFillers.length === 0
      ? "No filler phrases detected"
      : `Found ${foundFillers.length} filler phrase(s): "${foundFillers.join('", "')}"`,
  });

  // Check 3: Content not empty/minimal
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const hasSubstance = wordCount >= 10;
  checks.push({
    name: "substance",
    passed: hasSubstance,
    score: Math.min(1, wordCount / 20),
    message: hasSubstance ? `Content has ${wordCount} words` : `Content too short (${wordCount} words)`,
  });

  // Check 4: Voice match score
  if (voiceMatchScore !== null) {
    const voicePassed = voiceMatchScore >= 0.5;
    checks.push({
      name: "voice_match",
      passed: voicePassed,
      score: voiceMatchScore,
      message: voicePassed
        ? `Voice match score: ${Math.round(voiceMatchScore * 100)}%`
        : `Low voice match score: ${Math.round(voiceMatchScore * 100)}% — consider regenerating`,
    });
  }

  // Check 5: Predictive content score
  try {
    const prediction = await predictContentScore(
      workspaceId, platformId, contentDna, voiceMatchScore, platformFitScore, content
    );
    const predPassed = prediction.score >= 35;
    checks.push({
      name: "predicted_performance",
      passed: predPassed,
      score: prediction.score / 100,
      message: predPassed
        ? `Predicted engagement: ${prediction.level} (score: ${prediction.score}/100, based on ${prediction.similarPostCount} similar posts)`
        : `Predicted to underperform (score: ${prediction.score}/100) — consider regenerating with a different hook`,
    });
  } catch {
    // Non-fatal — skip predictive scoring
  }

  // Check 6: No self-referential AI content
  const aiPatterns = [
    "as an ai", "i'm an ai", "as a language model",
    "i cannot", "i don't have personal",
    "this was generated", "this content was created by",
  ];
  const hasAiPatterns = aiPatterns.some((p) => contentLower.includes(p));
  checks.push({
    name: "no_ai_leakage",
    passed: !hasAiPatterns,
    score: hasAiPatterns ? 0 : 1,
    message: hasAiPatterns
      ? "Content contains AI self-referential language — must be removed"
      : "No AI leakage detected",
  });

  // Calculate overall
  const passedChecks = checks.filter((c) => c.passed).length;
  const overallScore = Math.round((checks.reduce((s, c) => s + c.score, 0) / checks.length) * 100);
  const passed = checks.every((c) => c.passed) || overallScore >= 60;

  // Generate recommendation
  let recommendation: string | null = null;
  const failedChecks = checks.filter((c) => !c.passed);
  if (failedChecks.length > 0) {
    recommendation = `This output has ${failedChecks.length} quality concern(s): ${failedChecks.map((c) => c.message).join(". ")}`;
  }

  return { passed, overallScore, checks, recommendation };
}
