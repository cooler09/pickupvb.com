import * as Sentry from '@sentry/nextjs';

// Browser runtime — Next.js auto-loads `instrumentation-client.ts` from the
// project root (Next 14.2+/15+; works with both webpack and Turbopack).
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
