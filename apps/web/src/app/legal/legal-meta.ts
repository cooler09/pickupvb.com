/**
 * Single source of truth for the "last updated / reviewed" date on each legal
 * page. Consumed by the pages themselves (rendered in the header) and by the
 * sitemap, so `lastModified` reflects the real document date rather than the
 * build time (legal-pages audit L-9). Bump the relevant entry whenever you
 * substantively edit a legal page.
 */
export const LEGAL_LAST_UPDATED = {
  terms: 'May 18, 2026',
  privacy: 'May 26, 2026',
  refunds: 'May 18, 2026',
  accessibility: 'June 3, 2026',
} as const;

export type LegalSlug = keyof typeof LEGAL_LAST_UPDATED;

/** Parse the display date for `slug` into a `Date` for sitemap `lastModified`. */
export function legalLastUpdatedDate(slug: LegalSlug): Date {
  return new Date(LEGAL_LAST_UPDATED[slug]);
}
