/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@pickupvb/application',
    '@pickupvb/domain',
    '@pickupvb/infrastructure',
    '@pickupvb/supabase',
    '@pickupvb/types',
  ],
  typedRoutes: true,
  images: {
    // Supabase Storage public buckets. Wildcard covers both project URLs
    // (`<ref>.supabase.co`) and any custom domain mapped to Supabase.
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
    ],
  },
  // Baseline security headers. CSP is now enforced (P2 #3a, Bundle 27):
  // browsers block any resource that doesn't match the allowlist below.
  // The same policy soaked behind `Content-Security-Policy-Report-Only`
  // from Bundle 15 (2026-05-24) without producing real violations.
  // Nonce-based hardening of `'unsafe-inline'` on script-src/style-src
  // is still a follow-up (would require threading a nonce through
  // middleware to every inline JSON-LD `<script>` and Tailwind style).
  //
  // Inventory (see docs/audits/security.md P2 #3 / #3a):
  //   - Stripe.js: NOT used (server-side redirect to Checkout only) — no
  //     allowlist entry needed.
  //   - Supabase REST + Realtime: https://*.supabase.co (+.in) for fetch;
  //     wss://*.supabase.co (+.in) for the realtime WebSocket.
  //   - Sentry: tunneled through `/monitoring` (same-origin) — no
  //     ingest.sentry.io entry needed.
  //   - Cloudflare Turnstile: script + iframe at challenges.cloudflare.com.
  //     Token verification (siteverify) is server-side, so no connect-src
  //     entry needed.
  //   - OSM tiles: https://{s}.tile.openstreetmap.org for the leaflet map.
  //   - Photon / Nominatim: server-side only (geocoding API routes).
  //   - Fonts: system stack only (no next/font, no Google Fonts).
  //   - Inline scripts: JSON-LD `<script type="application/ld+json">` in
  //     layout + event pages. CSP applies to all `<script>` elements
  //     regardless of `type`, so `'unsafe-inline'` stays until a follow-up
  //     bundle wires a nonce through middleware.
  //   - Inline styles: Tailwind utility classes + the occasional style
  //     attribute (event-map height, dashboard widgets). `'unsafe-inline'`
  //     here is the practical default for Tailwind apps without a CSS
  //     hashing pipeline.
  //   - Workers: leaflet uses none today, but the React DevTools hook +
  //     Next dev overlay both use blob: workers. Allow `blob:` to keep
  //     `next dev` quiet.
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://*.tile.openstreetmap.org",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://challenges.cloudflare.com",
      'frame-src https://challenges.cloudflare.com',
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), microphone=(), camera=(), payment=(self)',
          },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
  // Force `www.pickupvb.com` → apex with a permanent (308) redirect.
  // Vercel's default www-redirect issues a 307 (Temporary), which doesn't
  // pass link equity and won't update SERP canonicals. 308 preserves both
  // the request method and the permanence signal. Apex is the canonical
  // host everywhere else (`metadataBase`, sitemap, robots.ts Host:).
  // See docs/audits/seo.md Bundle 54 remediation row.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.pickupvb.com' }],
        destination: 'https://pickupvb.com/:path*',
        permanent: true,
      },
    ];
  },
  // NOTE: `--webpack` is retained on `dev` / `build` (apps/web/package.json)
  // because the `webpack(config)` callback below installs an
  // `extensionAlias` that resolves `.js` / `.mjs` / `.cjs` import
  // specifiers to TS sources in our NodeNext ESM workspace packages
  // (`@pickupvb/{application,domain,infrastructure,supabase,types}`).
  // Turbopack doesn't honor `webpack()` callbacks, so dropping `--webpack`
  // breaks the build on the first cross-package `.js`-suffixed import.
  // Migrating to Turbopack is its own bundle: it needs an equivalent
  // `turbopack.resolveExtensions` config and a sweep of every
  // workspace-internal import specifier first. Tracked in
  // docs/audits/organization.md (P2 `--webpack` flag).
  webpack(config) {
    // Resolve `.js` / `.mjs` / `.cjs` import specifiers to TS sources
    // inside our ESM workspace packages (NodeNext-style imports).
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
};

// Wrap with Sentry's Next.js plugin: uploads source maps in CI, tunnels
// browser requests through /monitoring to dodge ad-blockers, and tree-shakes
// the SDK in client bundles. Only active when SENTRY_ORG + SENTRY_PROJECT +
// SENTRY_AUTH_TOKEN are all set; otherwise we export the bare next config
// and the runtime SDK no-ops (its `enabled` flag is already gated on
// NEXT_PUBLIC_SENTRY_DSN). Wrapping unconditionally crashes the build when
// any of org/project/authToken is undefined — the plugin's source-map
// pipeline calls `path.join(undefined, …)` and surfaces as
// `TypeError: The "path" argument must be of type string. Received undefined`.
import { withSentryConfig } from '@sentry/nextjs';

const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryConfigured = Boolean(sentryOrg && sentryProject && sentryAuthToken);

export default sentryConfigured
  ? withSentryConfig(nextConfig, {
      org: sentryOrg,
      project: sentryProject,
      authToken: sentryAuthToken,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      tunnelRoute: '/monitoring',
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
    })
  : nextConfig;
