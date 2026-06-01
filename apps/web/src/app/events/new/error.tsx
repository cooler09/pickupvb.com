'use client';

import * as Sentry from '@sentry/nextjs';
import { primaryButtonClass } from '@/components/primary-button';
import { useEffect } from 'react';

export default function NewEventError({
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
      <h1 className="text-fg text-2xl font-semibold">Couldn&apos;t load the create event form.</h1>
      <p className="text-muted text-sm">The error has been reported. Please try again.</p>
      <button type="button" onClick={reset} className={primaryButtonClass('md')}>
        Try again
      </button>
    </div>
  );
}
