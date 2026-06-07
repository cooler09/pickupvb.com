'use client';

import * as Sentry from '@sentry/nextjs';
import { primaryButtonClass } from '@/components/primary-button';
import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Route error boundary for /events/[id]. Reports to Sentry and offers a retry.
 */
export default function EventDetailError({
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
      <h1 className="text-fg text-headline-sm font-semibold">We hit a snag loading this event.</h1>
      <p className="text-muted text-sm">
        The error has been reported. You can try again or head back to the events list.
      </p>
      <div className="flex justify-center gap-2">
        <button type="button" onClick={reset} className={primaryButtonClass('md')}>
          Try again
        </button>
        <Link
          href="/events"
          className="border-border-base hover:bg-fg/5 rounded-md border px-4 py-2 text-sm font-medium"
        >
          Back to events
        </Link>
      </div>
    </div>
  );
}
