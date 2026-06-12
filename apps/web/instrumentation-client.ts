import * as Sentry from '@sentry/nextjs';

// Browser runtime — Next.js auto-loads `instrumentation-client.ts` from the
// project root (Next 14.2+/15+; works with both webpack and Turbopack).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  // Pin the release to the deployed commit so browser events match the
  // source-map upload release (server uses the bare VERCEL_GIT_COMMIT_SHA;
  // the client needs the NEXT_PUBLIC_ copy, which Vercel also exposes — same
  // mechanism as NEXT_PUBLIC_VERCEL_ENV above). See docs/sentry.md § 2a / TPI-15.
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // Prod trimmed 10% → 2% to match the server/edge configs. Browser
  // pageload/navigation transactions are the highest-volume span stream, so
  // leaving the client at 10% undercut the server-side trim.
  // See docs/audits/third-party-integrations.md TPI-10.
  tracesSampleRate: process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ? 0.02 : 1.0,

  // Session replay — disabled for normal sessions; sampled on errors. The
  // integration is always loaded because replay must buffer from page load to
  // capture the pre-error session, so it can't be lazy-loaded without losing
  // on-error replay. On-error rate trimmed 1.0 → 0.3 to bound replay-quota cost
  // during an error spike (third-party-integrations audit TPI-11).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.3,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Drop events from automated browsers (Playwright, headless Chrome, bots).
  // `navigator.webdriver` is `true` whenever the browser is driven by a
  // WebDriver/CDP client — Playwright sets this automatically.
  beforeSend(event) {
    if (typeof navigator !== 'undefined' && navigator.webdriver) return null;
    return event;
  },
});

// Required by the Sentry SDK to instrument client-side route transitions.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
