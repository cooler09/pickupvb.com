import * as Sentry from '@sentry/nextjs';

// Browser runtime — Next.js loads this automatically when the file is named
// `instrumentation-client.ts` (Sentry SDK v10+ on Next 14).
Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

    tracesSampleRate: process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ? 0.1 : 1.0,

    // Session replay — 0% normally, 100% on errors. Tweak when quota allows.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
        Sentry.replayIntegration({
            maskAllText: false,
            blockAllMedia: false,
        }),
    ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
