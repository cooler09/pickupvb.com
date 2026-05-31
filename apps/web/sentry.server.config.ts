import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  // Performance sampling. Server traces are the largest telemetry stream, so
  // prod is trimmed hard (2%) and the cron routes — `/api/notifications/*`,
  // which fire every 5/15 min and daily — are dropped entirely as pure noise.
  // Preview/dev capture everything. Raise the prod floor temporarily when
  // profiling a slow path. See docs/audits/third-party-integrations.md TPI-12.
  tracesSampler: (ctx) => {
    const name = ctx.transactionContext.name ?? '';
    if (name.includes('/api/notifications/')) return 0;
    return process.env.VERCEL_ENV === 'production' ? 0.02 : 1.0;
  },

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

  // Drop events from e2e runs (Playwright sends `x-pickupvb-e2e: 1` via
  // extraHTTPHeaders in playwright.config.ts).
  beforeSend(event) {
    const headers = event.request?.headers ?? {};
    if (headers['x-pickupvb-e2e'] === '1') return null;
    return event;
  },
});
