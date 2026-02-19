'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { ROUTES } from '@/lib/constants';
import { Skeleton } from '@/components/ui/skeleton';

export default function RootPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace(ROUTES.DASHBOARD);
      } else {
        router.replace(ROUTES.LOGIN);
      }
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-cme-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="gradient-text text-3xl tracking-tight">
          <span className="font-light">Content</span>
          <span className="font-bold">Engine</span>
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-2 w-24" />
        </div>
        <p className="text-sm text-cme-text-muted animate-pulse">Loading...</p>
      </div>
    </div>
  );
}
