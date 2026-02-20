'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

export function FirebaseAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    const unsubscribe = initialize();
    return () => unsubscribe();
  }, [initialize]);

  return <>{children}</>;
}
