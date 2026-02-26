'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error boundary caught:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0a0f',
          color: '#e4e4f0',
          fontFamily:
            "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '28rem', padding: '0 1rem' }}>
          <p
            style={{
              fontSize: '3.75rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #6c5ce7, #00cec9)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              margin: 0,
            }}
          >
            Error
          </p>
          <h1
            style={{
              marginTop: '1rem',
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#e4e4f0',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              marginTop: '0.5rem',
              fontSize: '0.875rem',
              color: '#a0a0c0',
              lineHeight: 1.6,
            }}
          >
            A critical error occurred. Please try again or return to the
            dashboard.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: '0.5rem',
                fontSize: '0.75rem',
                color: '#a0a0c0',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <div
            style={{
              marginTop: '2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
            }}
          >
            <a
              href="/dashboard"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.625rem 1.5rem',
                borderRadius: '0.5rem',
                border: '1px solid #1e1e3a',
                backgroundColor: 'transparent',
                color: '#e4e4f0',
                fontSize: '0.875rem',
                fontWeight: 500,
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              Dashboard
            </a>
            <button
              onClick={reset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.625rem 1.5rem',
                borderRadius: '0.5rem',
                border: 'none',
                backgroundColor: '#6c5ce7',
                color: '#ffffff',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
