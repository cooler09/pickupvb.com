import * as Sentry from '@sentry/nextjs';

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

    // Performance: 10% in prod, 100% in preview/dev. Adjust if quota gets tight.
    tracesSampleRate: process.env.VERCEL_ENV === 'production' ? 0.1 : 1.0,

    // Drop noise from expected domain errors — they're already mapped to HTTP
    // status codes by api-helpers.ts and are not actionable bugs.
    ignoreErrors: [
        'NotFoundError',
        'UnauthorizedError',
        'ValidationError',
        'ConflictError',
        'CapacityExceededError',
        'InvariantViolation',
    ],
});
