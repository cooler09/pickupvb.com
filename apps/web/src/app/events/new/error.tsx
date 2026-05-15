'use client';

import * as Sentry from '@sentry/nextjs';
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
            <h1 className="text-2xl font-semibold text-fg">Couldn&apos;t load the create event form.</h1>
            <p className="text-sm text-muted">
                The error has been reported. Please try again.
            </p>
            <button
                type="button"
                onClick={reset}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
            >
                Try again
            </button>
        </div>
    );
}
