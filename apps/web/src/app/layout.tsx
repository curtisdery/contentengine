import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const metadata: Metadata = {
  title: 'ContentEngine — Multiply Your Content',
  description:
    'ContentEngine is a futuristic content multiplier platform that helps creators repurpose and distribute their content across all platforms.',
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
        {children}
        <Toaster />
      </body>
    </html>
  );
}
