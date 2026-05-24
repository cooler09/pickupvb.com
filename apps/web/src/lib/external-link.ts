/**
 * External-link safety helper.
 *
 * User-supplied URLs (event external-registration URLs, profile websites,
 * community-listing destinations, group bios, …) get routed through a
 * `/leaving?url=…` interstitial that names the destination host before
 * sending the visitor off-site. Trusted hosts (our own domain plus a small
 * set of well-known third parties hosts will already recognize) bypass the
 * interstitial — adding a confirmation step there would just be friction.
 *
 * Keep the trusted list **conservative**. Anything we add here is a
 * statement that "this destination is safe enough that we won't warn the
 * user about it" — including the host itself and every subdomain.
 */

/**
 * Bare hostnames. A URL is trusted when its host equals one of these
 * entries or ends with `.<entry>` (so `www.pickupvb.com` and
 * `checkout.stripe.com` both match).
 */
const TRUSTED_HOSTS: ReadonlySet<string> = new Set([
  // Us.
  'pickupvb.com',
  // Payment + auth infra surfaced inside paid flows.
  'stripe.com',
  'supabase.co',
  // Common social hosts. We already render handle-based links to these
  // (see [social-links.tsx](../components/social-links.tsx)), so warning
  // on them would be noise.
  'instagram.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
]);

/**
 * `true` when the URL parses, uses http(s), and its host is in (or a
 * subdomain of) the trusted set.
 */
export function isTrustedExternalUrl(href: string): boolean {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    // Unparseable inputs should never have made it into the DB, but if
    // they do, treat them as untrusted so the interstitial can refuse
    // to redirect rather than us auto-opening them.
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.host.toLowerCase();
  for (const trusted of TRUSTED_HOSTS) {
    if (host === trusted || host.endsWith(`.${trusted}`)) return true;
  }
  return false;
}

/**
 * Returns the href to put on an `<a>` for a user-supplied external URL.
 * Trusted destinations get the original URL; everything else gets routed
 * through the `/leaving` interstitial.
 *
 * The returned value is always a string href, never a `Route` — call sites
 * should already be typing the link as a plain `<a>` rather than `<Link>`
 * since the destination is external.
 */
export function externalLinkHref(href: string): string {
  if (isTrustedExternalUrl(href)) return href;
  return `/leaving?url=${encodeURIComponent(href)}`;
}
