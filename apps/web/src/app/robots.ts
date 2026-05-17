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
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/profile/',
          '/login',
          '/forgot-password',
          '/reset-password',
          '/claim',
          '/claim/',
          '/tools',
          '/tools/',
          '/sentry-test',
          '/events/new',
          // Edit pages and bracket admin are per-event subroutes.
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
