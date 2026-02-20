'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/hooks/use-toast';
import { getFirebaseMessaging } from '@/lib/firebase';

export function FCMForegroundProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { success: showSuccess } = useToast();

  useEffect(() => {
    if (!isAuthenticated) return;

    let unsubscribe: (() => void) | undefined;

    async function setupForegroundListener() {
      const messaging = await getFirebaseMessaging();
      if (!messaging) return;

      const { onMessage } = await import('firebase/messaging');
      unsubscribe = onMessage(messaging, (payload) => {
        const title = payload.notification?.title || 'Pandocast';
        const body = payload.notification?.body || '';
        showSuccess(title, body);
      });
    }

    setupForegroundListener();

    return () => {
      unsubscribe?.();
    };
  }, [isAuthenticated, showSuccess]);

  return <>{children}</>;
}
