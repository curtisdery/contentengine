/**
 * Voice Insights — tracks voice match scores over time and identifies patterns.
 * Surfaces actionable feedback about voice profile accuracy.
 */

import { db } from "../../config/firebase.js";
import { Collections } from "../../shared/collections.js";

export interface VoiceInsight {
  type: "low_dimension" | "improving" | "declining" | "profile_update_suggested";
  message: string;
  confidence: number;
  dataPoints: number;
}

export interface VoiceInsightsReport {
  avgVoiceScore: number;
  scoresTrend: "improving" | "stable" | "declining";
  totalOutputsScored: number;
  approvalRate: number;
  insights: VoiceInsight[];
}

/**
 * Analyze voice match scores and approval patterns for a workspace.
 */
export async function getVoiceInsights(workspaceId: string): Promise<VoiceInsightsReport> {
  // Get all outputs with voice scores
  const outputsSnap = await db.collection(Collections.GENERATED_OUTPUTS)
    .where("workspaceId", "==", workspaceId)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  const scored = outputsSnap.docs
    .filter((d) => d.data().voiceMatchScore != null)
    .map((d) => ({
      score: d.data().voiceMatchScore as number,
      status: d.data().status as string,
      platformId: d.data().platformId as string,
      createdAt: d.data().createdAt,
    }));

  if (scored.length < 5) {
    return {
      avgVoiceScore: 0,
      scoresTrend: "stable",
      totalOutputsScored: scored.length,
      approvalRate: 0,
      insights: [{
        type: "profile_update_suggested",
        message: "Not enough data yet. Generate more content to get voice insights.",
        confidence: 0.5,
        dataPoints: scored.length,
      }],
    };
  }

  const avgScore = scored.reduce((s, o) => s + o.score, 0) / scored.length;
  const approvedOrPublished = scored.filter((o) => o.status === "approved" || o.status === "published").length;
  const approvalRate = approvedOrPublished / scored.length;

  // Trend: compare first half vs second half
  const midpoint = Math.floor(scored.length / 2);
  const recentScores = scored.slice(0, midpoint);
  const olderScores = scored.slice(midpoint);
  const recentAvg = recentScores.reduce((s, o) => s + o.score, 0) / recentScores.length;
  const olderAvg = olderScores.reduce((s, o) => s + o.score, 0) / olderScores.length;

  let scoresTrend: "improving" | "stable" | "declining" = "stable";
  if (recentAvg > olderAvg + 0.05) scoresTrend = "improving";
  else if (recentAvg < olderAvg - 0.05) scoresTrend = "declining";

  const insights: VoiceInsight[] = [];

  // Platform-specific voice analysis
  const platformScores: Record<string, { total: number; count: number }> = {};
  for (const output of scored) {
    if (!platformScores[output.platformId]) platformScores[output.platformId] = { total: 0, count: 0 };
    platformScores[output.platformId].total += output.score;
    platformScores[output.platformId].count += 1;
  }

  // Find platforms with consistently low voice scores
  for (const [pid, stats] of Object.entries(platformScores)) {
    if (stats.count < 3) continue;
    const platformAvg = stats.total / stats.count;
    if (platformAvg < 0.6) {
      insights.push({
        type: "low_dimension",
        message: `Voice match scores for ${pid} content are consistently low (avg ${Math.round(platformAvg * 100)}%). Consider adding platform-specific voice samples to improve matching.`,
        confidence: Math.min(0.9, 0.5 + stats.count * 0.05),
        dataPoints: stats.count,
      });
    }
  }

  // Trend-based insights
  if (scoresTrend === "declining") {
    insights.push({
      type: "declining",
      message: `Voice match scores have declined from ${Math.round(olderAvg * 100)}% to ${Math.round(recentAvg * 100)}%. Your writing style may have evolved — consider updating your voice profile with recent samples.`,
      confidence: 0.75,
      dataPoints: scored.length,
    });
  } else if (scoresTrend === "improving") {
    insights.push({
      type: "improving",
      message: `Voice match scores are improving (${Math.round(olderAvg * 100)}% → ${Math.round(recentAvg * 100)}%). The system is learning your voice better over time.`,
      confidence: 0.75,
      dataPoints: scored.length,
    });
  }

  // Approval rate insight
  if (approvalRate < 0.4 && scored.length >= 10) {
    insights.push({
      type: "profile_update_suggested",
      message: `Only ${Math.round(approvalRate * 100)}% of generated outputs are approved. Your voice profile may need updating — consider adding more recent writing samples that reflect your current style.`,
      confidence: 0.8,
      dataPoints: scored.length,
    });
  }

  if (avgScore > 0.8 && approvalRate > 0.7) {
    insights.push({
      type: "improving",
      message: `Voice matching is strong (${Math.round(avgScore * 100)}% avg score, ${Math.round(approvalRate * 100)}% approval rate). The AI has a good understanding of your voice.`,
      confidence: 0.85,
      dataPoints: scored.length,
    });
  }

  return {
    avgVoiceScore: Math.round(avgScore * 100) / 100,
    scoresTrend,
    totalOutputsScored: scored.length,
    approvalRate: Math.round(approvalRate * 100) / 100,
    insights,
  };
}
