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
  // Meetup — well-known events platform; our community directory links to
  // meetup.com event pages (the volleyball find-page scrape), and it's a
  // common host for user-supplied group/event links.
  'meetup.com',
  // Volleyball registration platforms + organizers we link to from the
  // **community directory** (admin-curated listings, not arbitrary user input).
  // These are the off-platform sources our scraped listings point at; warning
  // before sending a player to a tournament's own sign-up page is pure friction.
  // Entries match the host and every subdomain (so `usav.volleyballlife.com`,
  // `ddd.volleyballlife.com`, … are covered by `volleyballlife.com`).
  'volleyballlife.com', // AVP America, USA Volleyball Beach Tour, Seaside, DDD, p1440, BVNE … (per-affiliate subdomains)
  'volosports.com', // Volo — leagues / pickup / drop-in across ~13 metros
  'cbva.com', // California Beach Volleyball Association
  'avp.com', // AVP Pro + AVP Grass Tour
  'usavolleyball.org', // USA Volleyball
  'p1440.com',
  'bvne.org', // Beach Volleyball National Events
  'ssova.com', // Sunshine State Outdoor Volleyball Association (FL)
  // Marquee tournaments with their own sites.
  'pottstownrumble.com',
  'waupacaboatride.com',
  'seasidebeachvolleyball.com',
  'motherlodevolleyball.com',
  // Regional / metro organizers currently in the directory.
  'playerssports.net', // Players Sport & Social (Chicago)
  'chicagosocial.com', // Chicago Sport & Social Club
  'houstonssc.com', // Houston Sports & Social Club
  'sandbarslc.com', // SandBar (Salt Lake City)
  'sandbarbluffdale.com', // SandBar South (Bluffdale, UT)
  'angrydragonvolleyball.com', // Atlanta grass
  'spikefest.com', // Dallas
  'amarilloxtremevolleyball.com',
  'riseevents.us',
  'novaeventmanagement.com',
  'gatewayvb.org',
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
