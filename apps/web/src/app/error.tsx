'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error boundary caught:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-cme-error/10">
        <AlertTriangle className="h-8 w-8 text-cme-error" />
      </div>
      <h2 className="text-2xl font-bold text-cme-text">Something went wrong</h2>
      <p className="mt-2 max-w-md text-sm text-cme-text-muted">
        An unexpected error occurred. You can try again or return to the
        dashboard.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-cme-text-muted">
          Error ID: {error.digest}
        </p>
      )}
      <div className="mt-8 flex items-center gap-3">
        <Button
          variant="outline"
          onClick={() => {
            window.location.href = '/dashboard';
          }}
        >
          <Home className="mr-2 h-4 w-4" />
          Dashboard
        </Button>
        <Button onClick={reset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    </div>
  );
}
