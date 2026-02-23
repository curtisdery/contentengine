'use client';

import { useState, useEffect, useCallback } from 'react';
import { getFirebaseMessaging } from '@/lib/firebase';
import { callFunction } from '@/lib/cloud-functions';
import { useAuthStore } from '@/stores/auth-store';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported || !isAuthenticated) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== 'granted') return false;

      const messaging = await getFirebaseMessaging();
      if (!messaging) return false;

      const { getToken } = await import('firebase/messaging');
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      const token = await getToken(messaging, { vapidKey });

      if (token) {
        await callFunction('registerFCMToken', { token });
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, [isSupported, isAuthenticated]);

  return {
    permission,
    isSupported,
    requestPermission,
  };
}
