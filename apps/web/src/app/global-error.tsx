'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useMemo } from 'react';

/**
 * Root error boundary. Catches errors thrown during rendering of the root
 * layout and any unhandled errors below it that weren't caught by a nested
 * `error.tsx`. Must include its own <html><body> because the root layout has
 * crashed — Tailwind/global styles aren't guaranteed, so styles are inline.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const issueUrl = useMemo(() => buildIssueUrl(error), [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b1220',
          color: '#f8fafc',
        }}
      >
        <main style={{ maxWidth: 480, padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Something went very wrong.
          </h1>
          <p style={{ fontSize: '0.95rem', opacity: 0.85, marginBottom: '1.5rem' }}>
            We&apos;ve reported the error. You can try again, or open a GitHub issue with the
            details prefilled.
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 0,
                borderRadius: 6,
                padding: '0.55rem 1rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'transparent',
                color: '#f8fafc',
                border: '1px solid #475569',
                borderRadius: 6,
                padding: '0.55rem 1rem',
                fontSize: '0.9rem',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Report this bug
            </a>
          </div>
          {error.digest && (
            <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', opacity: 0.6 }}>
              Error digest: <code>{error.digest}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}

function buildIssueUrl(error: Error & { digest?: string }): string {
  const REPO = 'cooler09/pickupvb.com';
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const viewport =
    typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '';
  const envLines: string[] = [
    `- User agent: ${ua}`,
    `- Viewport: ${viewport}`,
    `- Time (UTC): ${new Date().toISOString()}`,
  ];
  if (error.digest) envLines.push(`- Error digest: \`${error.digest}\``);
  if (error.message) envLines.push(`- Error message: \`${error.message}\``);

  const params = new URLSearchParams({
    template: 'bug-report.yml',
    labels: 'bug,user-report,global-error',
    title: `Bug: global error — ${error.message || 'unknown'}`,
    'what-happened': '(please describe what you were doing when this happened)',
    page: url,
    environment: envLines.join('\n'),
  });
  return `https://github.com/${REPO}/issues/new?${params.toString()}`;
}
