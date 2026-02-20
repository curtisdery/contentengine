'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function OAuthCallbackPage() {
  const searchParams = useSearchParams();
  const oauthStatus = searchParams.get('status');
  const platform = searchParams.get('platform');
  const username = searchParams.get('username');
  const error = searchParams.get('error');

  useEffect(() => {
    // Notify the opener (parent window) of the OAuth result
    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'OAUTH_CALLBACK',
          status: oauthStatus,
          platform,
          username,
          error,
        },
        window.location.origin
      );
    }

    // Auto-close after a short delay
    const timer = setTimeout(() => {
      window.close();
    }, 1500);

    return () => clearTimeout(timer);
  }, [oauthStatus, platform, username, error]);

  const isSuccess = oauthStatus === 'success';

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950">
      <div className="text-center space-y-3">
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
            isSuccess ? 'bg-green-500/20' : 'bg-red-500/20'
          }`}
        >
          {isSuccess ? (
            <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        <p className="text-sm text-neutral-300">
          {isSuccess
            ? `Connection successful! Closing...`
            : `Connection failed${error ? `: ${error}` : ''}. Closing...`}
        </p>
      </div>
    </div>
  );
}
