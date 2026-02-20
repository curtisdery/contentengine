'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { trackEvent, setAnalyticsUserId, setAnalyticsUserProperties } from '@/lib/analytics';

export function AnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  // Track page views on route change
  useEffect(() => {
    trackEvent('page_view', { page_path: pathname });
  }, [pathname]);

  // Set user ID when authenticated
  useEffect(() => {
    if (user) {
      setAnalyticsUserId(user.id);
      setAnalyticsUserProperties({
        email: user.email,
      });
    } else {
      setAnalyticsUserId(null);
    }
  }, [user]);

  return <>{children}</>;
}
