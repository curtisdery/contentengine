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
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
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
