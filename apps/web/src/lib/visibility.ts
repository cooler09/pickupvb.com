/**
 * Event visibility — available to every host (free and Pro alike).
 *
 * All four modes are free:
 *
 * - `public`: listed everywhere (search, /events, sitemap).
 * - `invite_only`: unlisted; readable by anyone with the canonical URL.
 *   Excluded from /events listing, search, sitemap.
 * - `friends_of_host`: visible to followers/group-members of the host.
 * - `friends_of_attendees`: visible to followers of confirmed attendees.
 *
 * Non-public visibility used to be a Pro perk (audit P1 #1 — monetization).
 * That gate was removed by product decision; this helper now only normalizes
 * an untrusted submitted value to a recognized enum member, defending the
 * server boundary against junk input regardless of the host's tier.
 */
export const PUBLIC_VISIBILITY = 'public' as const;

const ALLOWED_VISIBILITIES = new Set<string>([
  'public',
  'invite_only',
  'friends_of_host',
  'friends_of_attendees',
]);

/**
 * Normalize a submitted visibility to a recognized enum member, falling back to
 * `public` for missing or unknown values.
 */
export function normalizeVisibility(submitted: string | null | undefined): string {
  if (!submitted || !ALLOWED_VISIBILITIES.has(submitted)) return PUBLIC_VISIBILITY;
  return submitted;
}
