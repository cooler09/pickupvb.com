import * as Sentry from '@sentry/nextjs';

// Edge runtime (middleware, edge route handlers).
Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    tracesSampleRate: process.env.VERCEL_ENV === 'production' ? 0.1 : 1.0,
});
