'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Logo } from '@/components/layout/logo';
import { ROUTES } from '@/lib/constants';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(ROUTES.DASHBOARD);
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="flex min-h-screen">
      {/* Left Panel — Animated mesh gradient */}
      <div className="relative hidden lg:flex lg:w-1/2 xl:w-[55%] items-center justify-center overflow-hidden mesh-gradient-bg">
        {/* Mesh orbs */}
        <div className="mesh-orb mesh-orb-1" />
        <div className="mesh-orb mesh-orb-2" />
        <div className="mesh-orb mesh-orb-3" />

        {/* Content overlay */}
        <div className="relative z-10 flex flex-col items-center space-y-6 px-12 text-center">
          <Logo size="lg" />
          <div className="max-w-md space-y-4 mt-8">
            <h2 className="text-2xl font-semibold text-cme-text">
              Upload once.
              <br />
              <span className="gradient-text">Pando everywhere.</span>
            </h2>
            <p className="text-cme-text-muted leading-relaxed">
              Pandocast analyzes your content's DNA, preserves your brand voice,
              and generates 18 platform-native formats — so one upload becomes
              your entire content calendar.
            </p>
          </div>

          {/* Decorative grid */}
          <div className="mt-12 grid grid-cols-3 gap-4 opacity-30">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="h-16 w-16 rounded-lg border border-cme-border/50 bg-cme-surface/20 backdrop-blur-sm"
                style={{
                  animationDelay: `${i * 0.2}s`,
                  animation: 'pulse 3s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        </div>

        {/* Gradient overlay at edges */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-cme-bg/30 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-cme-bg/40 to-transparent pointer-events-none" />
      </div>

      {/* Right Panel — Form */}
      <div className="flex w-full items-center justify-center bg-cme-bg lg:w-1/2 xl:w-[45%]">
        {children}
      </div>
    </div>
  );
}
