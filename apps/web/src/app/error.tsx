'use client';

import * as Sentry from '@sentry/nextjs';
import { primaryButtonClass } from '@/components/primary-button';
import Link from 'next/link';
import { useEffect } from 'react';

import { ReportBugButton } from '@/components/report-bug-button';

/**
 * Default route error boundary. Catches errors thrown in any route segment
 * that doesn't define its own `error.tsx`. Reports to Sentry and lets the
 * user retry or file a bug.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-4 py-12 text-center">
      <h1 className="text-fg text-2xl font-semibold">Something went wrong.</h1>
      <p className="text-muted text-sm">
        The error has been reported. You can try again, head home, or file a bug if it keeps
        happening.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className={primaryButtonClass('md')}>
          Try again
        </button>
        <Link
          href="/"
          className="border-border-base hover:bg-fg/5 rounded-md border px-4 py-2 text-sm font-medium"
        >
          Back home
        </Link>
        <ReportBugButton
          variant="button"
          label="Report this bug"
          {...(error.digest ? { errorDigest: error.digest } : {})}
          {...(error.message ? { errorMessage: error.message } : {})}
        />
      </div>
    </div>
  );
}
