'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { usePathname } from 'next/navigation';

/**
 * Bridges browser web-vitals (LCP / CLS / INP / FCP / TTFB / FID) into
 * the platform analytics port by POSTing each sample to
 * `/api/web-vitals`, which then calls `analytics.capture('web_vitals',
 * ...)`. PostHog only lives in the server-side adapter, so a beacon
 * hop is the simplest way to keep capture behind one port.
 *
 * Why `navigator.sendBeacon` (with `fetch` keepalive fallback):
 *  - LCP and CLS often finalize on page unload. `sendBeacon` is the
 *    standard browser primitive that survives the navigation; a
 *    regular `fetch()` would be cancelled.
 *
 * Why a `route` template instead of `usePathname()` verbatim:
 *  - Raw pathnames like `/events/abc-123` would explode PostHog's
 *    "by URL" rollups into thousands of unique strings. We mask
 *    UUID-shaped and numeric segments back to `[id]` so vitals roll
 *    up by route template.
 */
export function WebVitalsClient(): null {
  const pathname = usePathname();

  useReportWebVitals((metric) => {
    try {
      const name = metric.name as 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB' | 'FID';
      if (!['LCP', 'CLS', 'INP', 'FCP', 'TTFB', 'FID'].includes(name)) return;
      // Skip on automated browsers (matches AnalyticsClient).
      if (typeof navigator !== 'undefined' && navigator.webdriver) return;

      const body = JSON.stringify({
        metric: name,
        value:
          name === 'CLS' ? Math.round(metric.value * 10_000) / 10_000 : Math.round(metric.value),
        rating: metric.rating ?? null,
        route: maskRoute(pathname ?? '/'),
        navigationType:
          'navigationType' in metric && typeof metric.navigationType === 'string'
            ? metric.navigationType
            : null,
      });

      const url = '/api/web-vitals';
      const sent =
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function' &&
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));

      if (!sent) {
        void fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {
          // Analytics must never throw into the page.
        });
      }
    } catch {
      // Analytics must never throw into the page.
    }
  });

  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;

/**
 * Collapse dynamic segments to `[id]` so vitals roll up by route
 * template, not per-record URL. Matches the same shape Next prints in
 * its route map (`/events/[id]`).
 */
function maskRoute(pathname: string): string {
  if (!pathname.startsWith('/')) return '/';
  // Strip query / fragment defensively.
  const path = pathname.split('?')[0]?.split('#')[0] ?? '/';
  const segments = path.split('/');
  const masked = segments.map((seg) => {
    if (!seg) return seg;
    if (UUID_RE.test(seg)) return '[id]';
    if (NUMERIC_RE.test(seg)) return '[id]';
    return seg;
  });
  return masked.join('/') || '/';
}
