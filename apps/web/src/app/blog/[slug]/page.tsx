import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllPosts, getPostBySlug } from '../_posts';

// Dynamic content imports
const contentMap: Record<string, React.ComponentType> = {
  'introducing-pandocast': require('./_content/introducing-pandocast').default,
};

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: `${post.title} — Pandocast`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const Content = contentMap[slug];
  if (!Content) notFound();

  return (
    <div className="min-h-screen bg-cme-bg">
      {/* Header */}
      <header className="border-b border-cme-border/50">
        <div className="mx-auto max-w-3xl px-6 py-6 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-cme-text hover:text-cme-primary transition-colors">
            Pandocast
          </Link>
          <Link
            href="/blog"
            className="text-sm text-cme-text-muted hover:text-cme-text transition-colors"
          >
            &larr; All posts
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        <article>
          <div className="mb-8">
            <div className="mb-4 flex items-center gap-3 text-sm text-cme-text-muted">
              <time dateTime={post.date}>
                {new Date(post.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
              <span>·</span>
              <span>{post.readingTime}</span>
              <span>·</span>
              <span>{post.author}</span>
            </div>
            <h1 className="text-3xl font-bold text-cme-text md:text-4xl">{post.title}</h1>
          </div>

          <div className="prose-legal">
            <Content />
          </div>
        </article>
      </main>
    </div>
  );
}
