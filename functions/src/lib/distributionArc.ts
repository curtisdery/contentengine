/**
 * Distribution Arc — 14-day multi-platform scheduling algorithm.
 * Port of apps/api/app/services/scheduler.py DISTRIBUTION_ARC.
 */

export const DISTRIBUTION_ARC: Record<string, { day: number; hour: number; minute: number }> = {
  // Day 1 — Thought leadership launch
  linkedin_post: { day: 1, hour: 9, minute: 0 },
  twitter_thread: { day: 1, hour: 12, minute: 0 },
  twitter_single: { day: 1, hour: 15, minute: 0 },
  linkedin_article: { day: 1, hour: 10, minute: 30 },
  // Day 2 — Visual engagement
  instagram_carousel: { day: 2, hour: 11, minute: 0 },
  instagram_caption: { day: 2, hour: 14, minute: 0 },
  // Day 3 — Owned audience deep dive
  email_newsletter: { day: 3, hour: 8, minute: 0 },
  blog_seo: { day: 3, hour: 10, minute: 0 },
  // Day 4 — Community platforms
  bluesky_post: { day: 4, hour: 10, minute: 0 },
  // Day 5 — Video scripts
  short_form_video: { day: 5, hour: 11, minute: 0 },
  youtube_longform: { day: 5, hour: 14, minute: 0 },
  podcast_talking_points: { day: 5, hour: 16, minute: 0 },
  // Day 7 — Community value (time gap)
  reddit_post: { day: 7, hour: 10, minute: 0 },
  // Day 10+ — Evergreen long-tail
  quora_answer: { day: 10, hour: 10, minute: 0 },
  pinterest_pin: { day: 10, hour: 14, minute: 0 },
  medium_post: { day: 12, hour: 9, minute: 0 },
  // Day 14+ — Professional formats
  press_release: { day: 14, hour: 9, minute: 0 },
  slide_deck: { day: 14, hour: 11, minute: 0 },
};

export const CADENCE_DAYS: Record<string, number> = {
  twitter_single: 1, twitter_thread: 3, linkedin_post: 2, linkedin_article: 14,
  bluesky_post: 1, instagram_carousel: 2, instagram_caption: 2, pinterest_pin: 1,
  blog_seo: 3, email_newsletter: 4, medium_post: 4, youtube_longform: 4,
  short_form_video: 1, podcast_talking_points: 4, reddit_post: 2, quora_answer: 2,
  press_release: 60, slide_deck: 30,
};

export interface ArcItem {
  outputId: string;
  platformId: string;
  suggestedDatetime: Date;
}

/** Heatmap entry from real engagement data. */
export interface EngagementSlot {
  dayOfWeek: number;  // 0=Sunday
  hour: number;       // 0-23 UTC
  engagementRate: number;
  postCount: number;
}

/**
 * Create an intelligent publishing sequence from generated outputs.
 * If engagementSlots are provided (from real analytics), uses those
 * to pick optimal posting times instead of hardcoded defaults.
 */
export function createDistributionArc(
  outputs: Array<{ id: string; platformId: string }>,
  startDate: Date,
  engagementSlots?: EngagementSlot[]
): ArcItem[] {
  if (outputs.length === 0) return [];

  // Normalize to midnight UTC
  const base = new Date(startDate);
  base.setUTCHours(0, 0, 0, 0);

  const now = new Date();
  const items: ArcItem[] = [];

  // If we have real engagement data, find the best time slots
  const bestSlots = engagementSlots && engagementSlots.length >= 5
    ? findBestSlots(engagementSlots)
    : null;

  for (const output of outputs) {
    const arcInfo = DISTRIBUTION_ARC[output.platformId] ?? { day: 7, hour: 12, minute: 0 };

    let suggested = new Date(base);
    suggested.setUTCDate(suggested.getUTCDate() + arcInfo.day - 1);

    if (bestSlots) {
      // Use real engagement data to pick the best hour for this day
      const targetDayOfWeek = suggested.getUTCDay();
      const bestHour = bestSlots.get(targetDayOfWeek) ?? arcInfo.hour;
      suggested.setUTCHours(bestHour, 0, 0, 0);
    } else {
      suggested.setUTCHours(arcInfo.hour, arcInfo.minute, 0, 0);
    }

    // If in the past, push to now + 1 hour
    if (suggested < now) {
      suggested = new Date(now.getTime() + 60 * 60 * 1000);
      suggested.setUTCSeconds(0, 0);
    }

    items.push({
      outputId: output.id,
      platformId: output.platformId,
      suggestedDatetime: suggested,
    });
  }

  items.sort((a, b) => a.suggestedDatetime.getTime() - b.suggestedDatetime.getTime());
  return items;
}

/**
 * From real engagement data, find the best posting hour for each day of the week.
 */
function findBestSlots(slots: EngagementSlot[]): Map<number, number> {
  const bestByDay = new Map<number, { hour: number; rate: number }>();

  for (const slot of slots) {
    if (slot.postCount < 2) continue;  // Need at least 2 data points
    const current = bestByDay.get(slot.dayOfWeek);
    if (!current || slot.engagementRate > current.rate) {
      bestByDay.set(slot.dayOfWeek, { hour: slot.hour, rate: slot.engagementRate });
    }
  }

  const result = new Map<number, number>();
  for (const [day, { hour }] of bestByDay) {
    result.set(day, hour);
  }
  return result;
}
