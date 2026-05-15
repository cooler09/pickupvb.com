'use client';

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

/**
 * Root error boundary. Catches errors thrown during rendering of the root
 * layout and any unhandled errors below it that weren't caught by a nested
 * `error.tsx`. Must include its own <html><body> because the root layout has
 * crashed.
 */
export default function GlobalError({
    error,
}: {
    error: Error & { digest?: string };
}) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html lang="en">
            <body>
                <NextError statusCode={0} />
            </body>
        </html>
    );
}
