import * as Sentry from '@sentry/nextjs';

// Edge runtime (middleware, edge route handlers).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  // Pin the release to the deployed commit (matches server config). See
  // sentry.server.config.ts / docs/sentry.md § 2a / TPI-15.
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  // Prod trimmed from 10% to 2% to curb span volume (matches server config).
  tracesSampleRate: process.env.VERCEL_ENV === 'production' ? 0.02 : 1.0,

  // Drop events from e2e runs (Playwright sends `x-pickupvb-e2e: 1`).
  beforeSend(event) {
    const headers = event.request?.headers ?? {};
    if (headers['x-pickupvb-e2e'] === '1') return null;
    return event;
  },
});
