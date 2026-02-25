export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO date string
  author: string;
  readingTime: string;
}

export const posts: BlogPost[] = [
  {
    slug: 'introducing-pandocast',
    title: 'Introducing Pandocast — Upload Once. Pando Everywhere.',
    description:
      'Today we launch Pandocast: the AI content multiplier that turns one upload into 18 platform-native posts in your voice. Here\'s why we built it and how it works.',
    date: '2026-02-24',
    author: 'Pandocast Team',
    readingTime: '4 min read',
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getAllPosts(): BlogPost[] {
  return [...posts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
