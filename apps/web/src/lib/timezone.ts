import tzlookup from 'tz-lookup';

/**
 * Returns the IANA timezone name (e.g. "America/Los_Angeles") for the given
 * coordinates, or `null` if lookup fails. `tz-lookup` is a pure JS library
 * with a built-in quantized lookup table — no network, no DB call.
 *
 * Used when persisting events and community listings so we can display
 * dates in venue-local time regardless of the viewer's own timezone.
 */
export function timeZoneForCoords(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  try {
    const tz = tzlookup(latitude, longitude);
    return tz || null;
  } catch {
    return null;
  }
}
