/**
 * Predictive Content Scoring — estimates likely performance before publishing.
 * Uses historical engagement patterns, content features, and voice match to predict.
 */

import { Timestamp } from "firebase-admin/firestore";
import { db } from "../../config/firebase.js";
import { Collections } from "../../shared/collections.js";
import type { ContentDNA } from "../../shared/types.js";

export interface PredictedScore {
  score: number;           // 0-100
  confidence: "low" | "medium" | "high";
  level: "low" | "average" | "high" | "exceptional";
  factors: ScoreFactor[];
  similarPostCount: number;
}

interface ScoreFactor {
  name: string;
  value: number;     // 0-1 contribution
  weight: number;    // importance weight
  description: string;
}

/**
 * Predict engagement performance for a generated output before publishing.
 */
export async function predictContentScore(
  workspaceId: string,
  platformId: string,
  contentDna: ContentDNA,
  voiceMatchScore: number | null,
  platformFitScore: number | null,
  content: string
): Promise<PredictedScore> {
  // Gather historical data for this platform
  const ninetyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

  const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
    .where("workspaceId", "==", workspaceId)
    .where("platformId", "==", platformId)
    .where("snapshotTime", ">=", ninetyDaysAgo)
    .get();

  const dataPoints = snapshotsSnap.size;

  // Calculate factors
  const factors: ScoreFactor[] = [];

  // Factor 1: Platform fit score (from content type affinity)
  const fitScore = platformFitScore ?? 0.5;
  factors.push({
    name: "platform_fit",
    value: fitScore,
    weight: 0.25,
    description: `Content type "${contentDna.contentTypeClassification}" has ${Math.round(fitScore * 100)}% affinity with this platform`,
  });

  // Factor 2: Voice match score
  const voiceScore = voiceMatchScore ?? 0.5;
  factors.push({
    name: "voice_match",
    value: voiceScore,
    weight: 0.2,
    description: `Voice match score: ${Math.round(voiceScore * 100)}%`,
  });

  // Factor 3: Hook quality (based on number and diversity of hooks in DNA)
  const hookQuality = Math.min(1.0, (contentDna.bestHooks?.length || 0) / 3);
  factors.push({
    name: "hook_quality",
    value: hookQuality,
    weight: 0.2,
    description: `${contentDna.bestHooks?.length || 0} hooks identified in content DNA`,
  });

  // Factor 4: Content richness (key points, quotes, emotional arc)
  const keyPointScore = Math.min(1.0, (contentDna.keyPoints?.length || 0) / 4);
  const quoteScore = Math.min(1.0, (contentDna.quotableMoments?.length || 0) / 3);
  const arcScore = Math.min(1.0, (contentDna.emotionalArc?.length || 0) / 3);
  const richness = (keyPointScore + quoteScore + arcScore) / 3;
  factors.push({
    name: "content_richness",
    value: richness,
    weight: 0.15,
    description: `Content richness: ${contentDna.keyPoints?.length || 0} key points, ${contentDna.quotableMoments?.length || 0} quotes`,
  });

  // Factor 5: Historical platform performance (if we have data)
  let historicalFactor = 0.5;
  if (dataPoints >= 10) {
    let totalRate = 0;
    let rateCount = 0;
    for (const doc of snapshotsSnap.docs) {
      const d = doc.data();
      const impressions = (d.impressions as number) || 0;
      const engagements = (d.engagements as number) || 0;
      if (impressions > 0) {
        totalRate += engagements / impressions;
        rateCount++;
      }
    }
    if (rateCount > 0) {
      const avgRate = totalRate / rateCount;
      // Normalize: 1% engagement rate = 0.5, 5% = 1.0, 0% = 0
      historicalFactor = Math.min(1.0, avgRate / 0.05);
    }
  }
  factors.push({
    name: "historical_performance",
    value: historicalFactor,
    weight: 0.2,
    description: dataPoints >= 10
      ? `Based on ${dataPoints} historical data points on this platform`
      : `Limited data (${dataPoints} points) — using baseline estimate`,
  });

  // Calculate weighted score (0-100)
  const weightedSum = factors.reduce((sum, f) => sum + f.value * f.weight, 0);
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const normalizedScore = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  const score = Math.round(normalizedScore * 100);

  // Confidence based on data availability
  let confidence: "low" | "medium" | "high";
  if (dataPoints >= 30 && voiceMatchScore !== null) confidence = "high";
  else if (dataPoints >= 10) confidence = "medium";
  else confidence = "low";

  // Level classification
  let level: "low" | "average" | "high" | "exceptional";
  if (score >= 80) level = "exceptional";
  else if (score >= 60) level = "high";
  else if (score >= 40) level = "average";
  else level = "low";

  return {
    score,
    confidence,
    level,
    factors,
    similarPostCount: dataPoints,
  };
}
