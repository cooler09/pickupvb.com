import type { MetadataRoute } from 'next';
import { APP_URL, IS_PROD_HOST, PROD_APP_URL } from '@/lib/app-url';

/**
 * robots.txt for crawlers (Google, Bing, ChatGPT, Perplexity, …).
 * Allow public pages; block auth-required and admin/tool surfaces.
 *
 * On non-production hosts (dev.pickupvb.com, Vercel previews, etc.) we
 * disallow everything so crawlers don't index duplicate content.
 */
export default function robots(): MetadataRoute.Robots {
  if (!IS_PROD_HOST) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      host: APP_URL,
    };
  }
  return {
    rules: [
      {
        userAgent: '*',
        // The public bracket-spectator page lives under the `/events/*/bracket`
        // subtree that we disallow below to block the host/captain workspace.
        // A `Disallow` is a prefix match, so it would also shadow
        // `/events/<id>/bracket/watch` (+ its `/og` route) — a deliberately
        // public, indexable + shareable page with a canonical, OG image route,
        // and Twitter card. Google/Bing resolve allow-vs-disallow by *longest
        // match*, so this more-specific `Allow` wins for `/watch` and lets
        // crawlers + OG-unfurl bots reach it while the workspace stays blocked.
        allow: ['/', '/events/*/bracket/watch'],
        disallow: [
          '/api/',
          '/auth/',
          '/profile/',
          '/login',
          '/forgot-password',
          '/reset-password',
          '/claim',
          '/claim/',
          // Ephemeral scoreboard rooms (random 4-char codes, no useful
          // content to index) — but the tool index (/tools) and the
          // scoreboard landing page (/tools/scoreboard) are allowed so
          // search engines surface the free utility.
          '/tools/scoreboard/*',
          '/s/',
          '/sentry-test',
          '/events/new',
          // Edit pages and bracket admin are per-event subroutes. The public
          // spectator subpath `/events/*/bracket/watch` is re-allowed above.
          '/events/*/edit',
          '/events/*/bracket',
          '/groups/new',
          '/groups/*/edit',
          '/groups/*/members',
          '/teams/new',
        ],
      },
    ],
    sitemap: `${PROD_APP_URL}/sitemap.xml`,
    host: PROD_APP_URL,
  };
}
