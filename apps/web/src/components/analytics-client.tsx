'use client';

import { Analytics } from '@vercel/analytics/next';

/**
 * Wraps Vercel Analytics so we can pass a `beforeSend` function (functions
 * can't cross the server/client boundary, so this must live in a client file).
 * Drops events from automated browsers (Playwright, bots) — `navigator.webdriver`
 * is `true` whenever the browser is driven by a WebDriver/CDP client.
 */
export function AnalyticsClient() {
  return (
    <Analytics
      beforeSend={(event) => {
        if (typeof navigator !== 'undefined' && navigator.webdriver) return null;
        return event;
      }}
    />
  );
}
