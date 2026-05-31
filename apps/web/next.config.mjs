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
  //   - Map tiles: https://api.maptiler.com (MapTiler, keyed) in prod;
  //     https://{s}.tile.openstreetmap.org as the local-dev fallback.
  //   - Geocoding (MapTiler / Photon / Nominatim): server-side only (the
  //     /api/geocode routes + lib/geocode.ts) — no browser connect-src entry.
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
  //   - Vercel Live (preview deployments only): Vercel injects a feedback
  //     widget from https://vercel.live on preview builds. It loads a
  //     script + iframe from vercel.live, pulls assets from vercel.com,
  //     and opens a Pusher WebSocket (ws-*.pusher.com) for realtime
  //     comments. Not present on production builds; allowlisting is
  //     harmless either way and avoids noisy console errors on previews.
  //   - Media embeds (event/profile video posts): YouTube and Twitch are the
  //     only providers we iframe — see components/video-embed.tsx and the
  //     `ExternalVideoUrl` domain value. YouTube uses the privacy-enhanced
  //     youtube-nocookie.com/embed host (with www.youtube.com as the related
  //     fallback the player can navigate to); Twitch uses player.twitch.tv
  //     (VODs + channels) and clips.twitch.tv (clips). Instagram / TikTok /
  //     Facebook / `other` render as link cards, not iframes, so they need no
  //     frame-src entry. These touch frame-src ONLY: the framed third-party
  //     document loads its own scripts / images / XHR under its own origin, so
  //     our CSP doesn't need matching img-src / connect-src / script-src
  //     entries, and embeds aren't a CORS concern (no cross-origin fetch from
  //     our code — the browser just renders the iframe).
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://vercel.live https://*.i.posthog.com",
      "style-src 'self' 'unsafe-inline' https://vercel.live",
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://api.maptiler.com https://*.tile.openstreetmap.org https://vercel.live https://vercel.com",
      "font-src 'self' data: https://vercel.live https://assets.vercel.com",
      "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://challenges.cloudflare.com https://vercel.live wss://ws-us3.pusher.com https://*.i.posthog.com",
      'frame-src https://challenges.cloudflare.com https://vercel.live https://www.youtube-nocookie.com https://www.youtube.com https://player.twitch.tv https://clips.twitch.tv',
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
