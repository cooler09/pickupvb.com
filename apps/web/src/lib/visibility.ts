/**
 * Event visibility — Pro-gated.
 *
 * `public` is free. The three non-public modes (`invite_only`,
 * `friends_of_host`, `friends_of_attendees`) require Pro benefits:
 *
 * - `invite_only`: unlisted; readable by anyone with the canonical URL.
 *   Excluded from /events listing, search, sitemap.
 * - `friends_of_host`: visible to followers/group-members of the host.
 * - `friends_of_attendees`: visible to followers of confirmed attendees.
 *
 * The UI disables the gated options for Free hosts; this helper enforces
 * the same clamp server-side so the rule can't be bypassed via curl /
 * devtools (audit P1 #1 — monetization).
 */
export const PUBLIC_VISIBILITY = 'public' as const;

const GATED_VISIBILITIES = new Set<string>([
  'invite_only',
  'friends_of_host',
  'friends_of_attendees',
]);

const ALLOWED_VISIBILITIES = new Set<string>([
  'public',
  'invite_only',
  'friends_of_host',
  'friends_of_attendees',
]);

/**
 * Clamp a submitted visibility to `public` if the host doesn't have Pro
 * benefits, or if the value isn't a recognized enum member.
 */
export function clampVisibilityForHost(
  submitted: string | null | undefined,
  hostHasProBenefits: boolean,
): string {
  if (!submitted || !ALLOWED_VISIBILITIES.has(submitted)) return PUBLIC_VISIBILITY;
  if (!hostHasProBenefits && GATED_VISIBILITIES.has(submitted)) return PUBLIC_VISIBILITY;
  return submitted;
}

export function isGatedVisibility(value: string): boolean {
  return GATED_VISIBILITIES.has(value);
}
