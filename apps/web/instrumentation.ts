import * as Sentry from '@sentry/nextjs';

/**
 * Next.js calls this on cold start (Node and Edge runtimes).
 * Loads the matching Sentry SDK so server components, route handlers,
 * server actions, and middleware all report errors to Sentry.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('./sentry.server.config');
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('./sentry.edge.config');
    }
}

export const onRequestError = Sentry.captureRequestError;
