/**
 * Canonical app URL helpers.
 *
 * Production is always `https://pickupvb.com`. Non-prod environments
 * (dev.pickupvb.com, Vercel previews, localhost) override via
 * `NEXT_PUBLIC_APP_URL`.
 *
 * Use `APP_URL` when constructing share/CTA links that should match the
 * deployment the visitor is on. Keep SEO-canonical identifiers
 * (`metadataBase`, JSON-LD `@id`s) pinned to `PROD_APP_URL` so dev /
 * preview pages don't accidentally cannibalize production indexing.
 *
 * Use `IS_PROD_HOST` to gate behavior that should only happen on the
 * canonical production deployment — e.g. emitting an indexable
 * `robots.txt` and a real sitemap.
 */

export const PROD_APP_URL = 'https://pickupvb.com';

export const APP_URL = (() => {
  const raw = process.env['NEXT_PUBLIC_APP_URL'];
  if (!raw) return PROD_APP_URL;
  return raw.replace(/\/+$/, '');
})();

export const IS_PROD_HOST = APP_URL === PROD_APP_URL;
