export interface PlatformProfile {
  platformId: string;
  name: string;
  tier: number;
  mediaFormat: string;
}

export const PLATFORM_PROFILES: Record<string, PlatformProfile> = {
  twitter_single: { platformId: 'twitter_single', name: 'Twitter/X Single Tweet', tier: 1, mediaFormat: 'text' },
  twitter_thread: { platformId: 'twitter_thread', name: 'Twitter/X Thread', tier: 1, mediaFormat: 'text' },
  linkedin_post: { platformId: 'linkedin_post', name: 'LinkedIn Post', tier: 1, mediaFormat: 'text' },
  linkedin_article: { platformId: 'linkedin_article', name: 'LinkedIn Article', tier: 1, mediaFormat: 'text' },
  bluesky_post: { platformId: 'bluesky_post', name: 'Bluesky Post', tier: 1, mediaFormat: 'text' },
  instagram_carousel: { platformId: 'instagram_carousel', name: 'Instagram Carousel', tier: 2, mediaFormat: 'carousel' },
  instagram_caption: { platformId: 'instagram_caption', name: 'Instagram Caption', tier: 2, mediaFormat: 'text+image' },
  pinterest_pin: { platformId: 'pinterest_pin', name: 'Pinterest Pin', tier: 2, mediaFormat: 'text+image' },
  blog_seo: { platformId: 'blog_seo', name: 'SEO Blog Post', tier: 3, mediaFormat: 'text' },
  email_newsletter: { platformId: 'email_newsletter', name: 'Email Newsletter', tier: 3, mediaFormat: 'text' },
  medium_post: { platformId: 'medium_post', name: 'Medium Post', tier: 3, mediaFormat: 'text' },
  youtube_longform: { platformId: 'youtube_longform', name: 'YouTube Long-Form Video Script', tier: 4, mediaFormat: 'video_script' },
  short_form_video: { platformId: 'short_form_video', name: 'Short-Form Video Script (Reels/TikTok/Shorts)', tier: 4, mediaFormat: 'video_script' },
  podcast_talking_points: { platformId: 'podcast_talking_points', name: 'Podcast Talking Points & Episode Outline', tier: 4, mediaFormat: 'audio' },
  reddit_post: { platformId: 'reddit_post', name: 'Reddit Post', tier: 5, mediaFormat: 'text' },
  quora_answer: { platformId: 'quora_answer', name: 'Quora Answer', tier: 5, mediaFormat: 'text' },
  press_release: { platformId: 'press_release', name: 'Press Release', tier: 6, mediaFormat: 'text' },
  slide_deck: { platformId: 'slide_deck', name: 'Slide Deck / Presentation', tier: 6, mediaFormat: 'text' },
};

export function getPlatformName(platformId: string): string {
  return PLATFORM_PROFILES[platformId]?.name ?? platformId;
}

export function getAllPlatforms(): PlatformProfile[] {
  return Object.values(PLATFORM_PROFILES);
}
