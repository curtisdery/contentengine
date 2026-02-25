import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseAuthProvider } from '@/components/providers/firebase-auth-provider';
import { AnalyticsProvider } from '@/components/providers/analytics-provider';
import { FCMForegroundProvider } from '@/components/providers/fcm-foreground-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pandocast — Upload once. Pando everywhere.',
  description:
    'Pandocast analyzes your content\'s DNA, preserves your brand voice, and generates 18 platform-native formats — so one upload becomes your entire content calendar.',
  metadataBase: new URL('https://pandocast.ai'),
  openGraph: {
    title: 'Pandocast — Upload once. Pando everywhere.',
    description:
      'One upload becomes 18 platform-native posts — all in your voice, ready to publish.',
    url: 'https://pandocast.ai',
    siteName: 'Pandocast',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pandocast — Upload once. Pando everywhere.',
    description:
      'One upload becomes 18 platform-native posts — all in your voice, ready to publish.',
    site: '@pandocast',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://pandocast.ai',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'Pandocast',
      url: 'https://pandocast.ai',
      logo: 'https://pandocast.ai/opengraph-image',
      sameAs: ['https://twitter.com/pandocast'],
      description:
        'AI content multiplier that transforms one upload into 18 platform-native posts — preserving your voice across every channel.',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Pandocast',
      url: 'https://pandocast.ai',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'Upload once. Pando everywhere. One upload becomes 18 platform-native posts in your voice.',
      offers: [
        {
          '@type': 'Offer',
          name: 'Free',
          price: '0',
          priceCurrency: 'USD',
          description: '3 uploads/month, 5 platforms, basic voice matching',
        },
        {
          '@type': 'Offer',
          name: 'Growth',
          price: '29',
          priceCurrency: 'USD',
          description: '25 uploads/month, all 18 platforms, brand voice profiles, content calendar',
        },
        {
          '@type': 'Offer',
          name: 'Pro',
          price: '79',
          priceCurrency: 'USD',
          description: 'Unlimited uploads, autopilot scheduling, A/B testing, full analytics, API access',
        },
      ],
    },
    {
      '@type': 'WebSite',
      name: 'Pandocast',
      url: 'https://pandocast.ai',
      description:
        'AI content multiplier that transforms one upload into 18 platform-native posts in your voice.',
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen bg-cme-bg text-cme-text antialiased">
        <FirebaseAuthProvider>
          <Suspense>
            <AnalyticsProvider>
              <FCMForegroundProvider>
                {children}
              </FCMForegroundProvider>
            </AnalyticsProvider>
          </Suspense>
        </FirebaseAuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
