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
  // Baseline security headers. CSP is intentionally not set here yet — it
  // needs an allowlist for Stripe.js, Supabase, Sentry, OSM tiles, fonts,
  // images, and should roll out behind Content-Security-Policy-Report-Only
  // first. See docs/audits/security.md P2 #3.
  async headers() {
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
        ],
      },
    ];
  },
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
