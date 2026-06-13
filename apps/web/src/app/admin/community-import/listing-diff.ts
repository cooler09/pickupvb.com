import type { CommunityListing } from '@pickupvb/domain';
import type { CreateCommunityListingDto } from '@pickupvb/types';

const norm = (s: string | null | undefined): string => (s ?? '').trim();
const ms = (d: Date | null | undefined): number | null => (d ? d.getTime() : null);
// Compare coordinates to ~5 decimals (~1m) so a float round-trip through PostGIS
// doesn't read back as a "change".
const coord = (n: number | null | undefined): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 1e5) / 1e5 : null;

/**
 * True when re-importing `dto` would change nothing about the existing
 * `listing` — so the bulk importer can **skip the write and report it
 * "unchanged"** instead of churning every row on every re-import.
 *
 * Compares the user-facing importable fields: title/description/host/url,
 * start/end instants, all-day, surface/format/skill, timezone, and the full
 * location (text parts + coords to ~1m). Deliberately lenient where the domain
 * normalizes on write (title/description are trimmed + profanity-masked) — a
 * false "changed" only costs a harmless no-op re-update, whereas a false
 * "unchanged" would silently drop a real edit, so we bias toward updating.
 */
export function dtoMatchesListing(
  listing: CommunityListing,
  dto: CreateCommunityListingDto,
): boolean {
  if (norm(listing.title) !== norm(dto.title)) return false;
  if (norm(listing.description) !== norm(dto.description)) return false;
  if (norm(listing.externalUrl.toString()) !== norm(dto.externalUrl)) return false;
  if (norm(listing.externalHostName) !== norm(dto.externalHostName)) return false;
  if (ms(listing.startsAt) !== ms(dto.startsAt)) return false;
  if (ms(listing.endsAt) !== ms(dto.endsAt ?? null)) return false;
  if (listing.allDay !== (dto.allDay ?? false)) return false;
  if ((listing.surface ?? null) !== (dto.surface ?? null)) return false;
  if ((listing.format ?? null) !== (dto.format ?? null)) return false;
  if ((listing.skillLevel ?? null) !== (dto.skillLevel ?? null)) return false;
  if (norm(listing.timeZone) !== norm(dto.timeZone)) return false;

  const a = listing.location;
  const b = dto.location ?? null;
  if ((a === null) !== (b == null)) return false;
  if (a && b) {
    if (norm(a.addressLine) !== norm(b.addressLine)) return false;
    if (norm(a.city) !== norm(b.city)) return false;
    if (norm(a.region) !== norm(b.region)) return false;
    if (norm(a.postalCode) !== norm(b.postalCode)) return false;
    if (norm(a.country) !== norm(b.country)) return false;
    if (coord(a.latitude) !== coord(b.latitude)) return false;
    if (coord(a.longitude) !== coord(b.longitude)) return false;
  }
  return true;
}
