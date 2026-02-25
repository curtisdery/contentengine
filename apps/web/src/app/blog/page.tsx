import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts } from './_posts';

export const metadata: Metadata = {
  title: 'Blog — Pandocast',
  description: 'Insights on content repurposing, AI-powered distribution, and growing your audience across every platform.',
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="min-h-screen bg-cme-bg">
      {/* Header */}
      <header className="border-b border-cme-border/50">
        <div className="mx-auto max-w-3xl px-6 py-6 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-cme-text hover:text-cme-primary transition-colors">
            Pandocast
          </Link>
          <Link
            href="/"
            className="text-sm text-cme-text-muted hover:text-cme-text transition-colors"
          >
            &larr; Back to home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold text-cme-text mb-2">Blog</h1>
        <p className="text-cme-text-muted mb-10">
          Insights on content repurposing, AI-powered distribution, and growing your audience.
        </p>

        <div className="space-y-8">
          {posts.map((post) => (
            <article key={post.slug} className="group">
              <Link href={`/blog/${post.slug}`} className="block">
                <div className="rounded-xl border border-cme-border bg-cme-surface/50 p-6 transition-all hover:border-cme-border-bright hover:bg-cme-surface-hover">
                  <div className="mb-3 flex items-center gap-3 text-xs text-cme-text-muted">
                    <time dateTime={post.date}>
                      {new Date(post.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </time>
                    <span>·</span>
                    <span>{post.readingTime}</span>
                  </div>
                  <h2 className="text-xl font-bold text-cme-text mb-2 group-hover:text-cme-primary transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-sm text-cme-text-muted leading-relaxed">
                    {post.description}
                  </p>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
