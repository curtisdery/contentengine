import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Pandocast',
  description: 'Pandocast Privacy Policy. Learn how we collect, use, store, and protect your information.',
};

export default function PrivacyPage() {
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
        <article className="prose-legal">
          <h1 className="text-3xl font-bold text-cme-text mb-2">Privacy Policy</h1>
          <p className="text-sm text-cme-text-muted mb-10">Effective: February 24, 2026</p>

          <p>
            Pandocast Inc. (&ldquo;Pandocast,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
            &ldquo;our&rdquo;) operates the Pandocast platform at pandocast.ai. This policy explains
            how we collect, use, store, and protect your information when you use our service.
          </p>

          <h2>1. Information We Collect</h2>
          <p>
            <strong>Account information:</strong> When you create an account, we collect your name,
            email address, and password. If you sign in via Google or Apple, we receive your name and
            email from that provider.
          </p>
          <p>
            <strong>Content you provide:</strong> We store the content you upload for transformation
            (blog posts, transcripts, articles, videos) and the generated outputs we create from that
            content.
          </p>
          <p>
            <strong>Connected platform data:</strong> When you connect social media accounts
            (Twitter/X, LinkedIn, Instagram, YouTube, TikTok), we store OAuth access tokens and
            refresh tokens in encrypted form to publish content and retrieve analytics on your behalf.
            We also collect your public profile information (username, display name, follower count)
            and post-level analytics (impressions, engagements, shares, comments) for posts published
            through our platform.
          </p>
          <p>
            <strong>Payment information:</strong> Payments are processed by Stripe. We store your
            Stripe customer ID and subscription status but never store credit card numbers, bank
            account details, or other payment instrument data on our servers.
          </p>
          <p>
            <strong>Usage data:</strong> We collect information about how you use the platform,
            including features accessed, content uploaded, outputs generated, and posts published. We
            also collect device type, browser type, and IP address for security and analytics
            purposes.
          </p>

          <h2>2. How We Use Your Information</h2>
          <ul>
            <li>
              To provide the Pandocast service: transforming your content, publishing to your
              connected platforms, and displaying analytics.
            </li>
            <li>To manage your account and process payments.</li>
            <li>To improve our service based on aggregated, anonymized usage patterns.</li>
            <li>
              To send transactional emails (account verification, billing, publishing status).
            </li>
            <li>To detect and prevent fraud, abuse, and security threats.</li>
          </ul>
          <p>
            <strong>We do not sell your personal information.</strong> We do not use your content to
            train, fine-tune, or improve any AI or machine learning models &mdash; whether ours, our
            AI providers&rsquo;, or any third party&rsquo;s. Your uploaded content is processed
            through AI services solely to generate outputs for your use. Your content is yours.
          </p>

          <h2>3. Third-Party Services</h2>
          <p>We share data with third parties only as necessary to provide the service:</p>
          <ul>
            <li>
              <strong>Stripe</strong> &mdash; payment processing.
            </li>
            <li>
              <strong>Anthropic (Claude AI)</strong> &mdash; content analysis and generation. Content
              is sent to Anthropic&rsquo;s API for processing. We use zero-data-retention API
              configurations where available, meaning Anthropic does not retain your content after
              processing. We contractually require that our AI providers do not use your content for
              model training.
            </li>
            <li>
              <strong>Google Cloud Platform</strong> &mdash; infrastructure hosting, data storage, and
              background job processing.
            </li>
            <li>
              <strong>Social media platforms</strong> (Twitter/X, LinkedIn, Meta/Instagram, YouTube,
              TikTok) &mdash; we access their APIs to publish content and retrieve analytics using
              your authorized credentials.
            </li>
          </ul>
          <p>
            We do not share, sell, or provide your personal information or content to data brokers,
            advertisers, or any other third parties not listed above.
          </p>

          <h2>4. Data Storage and Security</h2>
          <p>
            Your data is stored on Google Cloud Platform infrastructure in the United States. Social
            media access tokens are encrypted at rest using AES-256-GCM encryption with keys managed
            through Google Cloud Secret Manager. We use HTTPS/TLS for all data in transit. Access to
            production systems is restricted to authorized personnel and is audited.
          </p>

          <h2>5. Data Retention</h2>
          <p>
            We retain your account data and content for as long as your account is active. If you
            delete your account, we initiate a 30-day grace period during which your account can be
            recovered. After 30 days, we permanently delete all your data, including uploaded content,
            generated outputs, analytics data, encrypted platform tokens, and account information.
            Anonymized, aggregated analytics (which cannot be linked back to you) may be retained for
            service improvement.
          </p>

          <h2>6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>
              <strong>Access your data</strong> &mdash; request a complete export of all data we hold
              about you.
            </li>
            <li>
              <strong>Correct your data</strong> &mdash; update your account information at any time.
            </li>
            <li>
              <strong>Delete your data</strong> &mdash; delete your account and all associated data.
            </li>
            <li>
              <strong>Disconnect platforms</strong> &mdash; revoke Pandocast&rsquo;s access to any
              connected social media account at any time.
            </li>
            <li>
              <strong>Port your data</strong> &mdash; export your content and analytics in standard
              formats.
            </li>
            <li>
              <strong>Object to processing</strong> &mdash; where applicable under your local laws.
            </li>
          </ul>
          <p>
            To exercise these rights, contact us at{' '}
            <a href="mailto:privacy@pandocast.ai">privacy@pandocast.ai</a> or use the account
            settings page. We will respond to data rights requests within 30 days.
          </p>

          <h2>7. International Users</h2>
          <p>
            If you are located in the European Union, European Economic Area, United Kingdom, or
            other jurisdictions with data protection laws, you may have additional rights under
            applicable law (such as the GDPR or UK GDPR). We process your data on the basis of: (a)
            performance of our contract with you (these Terms), (b) your consent (where applicable),
            and (c) our legitimate interests in providing and improving the Service. You may contact
            us at <a href="mailto:privacy@pandocast.ai">privacy@pandocast.ai</a> to exercise any
            rights under your local data protection laws.
          </p>

          <h2>8. Cookies</h2>
          <p>
            We use essential cookies for authentication and session management. We do not use
            third-party advertising cookies or cross-site tracking. We may use analytics cookies to
            understand aggregate usage patterns; these do not identify you personally.
          </p>

          <h2>9. Children&rsquo;s Privacy</h2>
          <p>
            Pandocast is not intended for use by anyone under the age of 16. We do not knowingly
            collect personal information from children under 16. If we learn that we have collected
            personal information from a child under 16, we will delete that information promptly.
          </p>

          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this policy from time to time. We will notify you of material changes via
            email or an in-app notification at least 30 days before the changes take effect. The
            updated policy will be posted on this page with a revised effective date.
          </p>

          <h2>11. Contact</h2>
          <p>For privacy-related questions or data rights requests:</p>
          <p>
            Email: <a href="mailto:hello@pandocast.ai">hello@pandocast.ai</a>
          </p>
          <p>
            General support: <a href="mailto:support@pandocast.ai">support@pandocast.ai</a>
          </p>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-cme-border/50 py-8">
        <div className="mx-auto max-w-3xl px-6 text-center text-sm text-cme-text-muted">
          &copy; {new Date().getFullYear()} Pandocast Inc. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
