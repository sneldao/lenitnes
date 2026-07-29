'use client';

import { useEffect } from 'react';

/**
 * Global error boundary — catches errors that propagate past the root
 * layout. This file must define its own <html>/<body> tags because the
 * app's root layout may have crashed and can't be relied upon.
 *
 * Keep imports minimal: only React hooks and no layout-level context.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError] unhandled error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#06090f',
          color: '#e2e8f0',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #ef4444, #f87171)',
              color: '#06090f',
              fontWeight: 900,
              fontSize: 20,
            }}
          >
            !
          </div>
          <h1
            style={{
              margin: '0 0 8px',
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: '#f1f5f9',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 14,
              color: '#94a3b8',
              lineHeight: 1.5,
              maxWidth: 400,
            }}
          >
            The application encountered an unexpected error. The system has been notified.
          </p>
          {error.digest && (
            <p
              style={{
                margin: '0 0 24px',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: 11,
                color: '#475569',
              }}
            >
              Error ref: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 12,
              background: '#06b6d4',
              border: 'none',
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 600,
              color: '#06090f',
              cursor: 'pointer',
              boxShadow: '0 0 20px rgba(6,182,212,0.15)',
              transition: 'background 150ms ease, box-shadow 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#22d3ee';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(6,182,212,0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#06b6d4';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(6,182,212,0.15)';
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
