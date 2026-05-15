'use client';

import * as Sentry from '@sentry/nextjs';
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
            <h1 className="text-2xl font-semibold text-fg">We hit a snag loading this event.</h1>
            <p className="text-sm text-muted">
                The error has been reported. You can try again or head back to the events list.
            </p>
            <div className="flex justify-center gap-2">
                <button
                    type="button"
                    onClick={reset}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
                >
                    Try again
                </button>
                <a
                    href="/events"
                    className="rounded-md border border-border-base px-4 py-2 text-sm font-medium hover:bg-fg/5"
                >
                    Back to events
                </a>
            </div>
        </div>
    );
}
