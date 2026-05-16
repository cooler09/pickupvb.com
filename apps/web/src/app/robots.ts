import type { MetadataRoute } from 'next';

/**
 * robots.txt for crawlers (Google, Bing, ChatGPT, Perplexity, …).
 * Allow public pages; block auth-required and admin/tool surfaces.
 */
export default function robots(): MetadataRoute.Robots {
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
        sitemap: 'https://pickupvb.com/sitemap.xml',
        host: 'https://pickupvb.com',
    };
}
