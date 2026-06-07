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

/**
 * Offset of an IANA `timeZone` from UTC at a given instant, in milliseconds
 * (e.g. `-14400000` for America/New_York in summer / EDT). Implemented with
 * `Intl.DateTimeFormat` since the repo carries no date library.
 */
function zoneOffsetMs(timeZone: string, at: Date): number | null {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = dtf.formatToParts(at);
    const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
    const asLocal = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    if (Number.isNaN(asLocal)) return null;
    return asLocal - at.getTime();
  } catch {
    return null;
  }
}

/**
 * Convert a naive wall-clock string (`'YYYY-MM-DDTHH:mm'`, optionally `:ss`, no
 * zone) to the exact UTC instant it represents *in `timeZone`*.
 *
 * This is what the community **importer** needs and what `DateTimePicker`
 * already does for the interactive forms (it submits a `Z` ISO built from the
 * creator's browser zone). A draft's `startsAtLocal` is venue-local wall-clock,
 * and the venue zone comes from geocoding — the server's own zone is irrelevant.
 * A plain `new Date('…T09:00')` parses in the *server's* zone (UTC on Vercel),
 * which silently stored imported times 4–5h off; this anchors them in the venue
 * zone instead.
 *
 * No date library, so we use the standard offset trick: interpret the
 * wall-clock as if UTC, ask the zone what that instant maps to locally, and
 * subtract the delta. Accurate to the minute except for the ~1h/year a time
 * sits inside a DST transition (events never do). When `timeZone` is null /
 * invalid we fall back to treating the wall-clock as UTC — deterministic, and
 * the same result the old code produced on a UTC server.
 */
export function zonedWallClockToUtc(local: string, timeZone: string | null): Date | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    const fallback = new Date(local);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, year, month, day, hour, minute, second] = m;
  const wallAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    second ? Number(second) : 0,
  );
  if (!timeZone) return new Date(wallAsUtc);
  const offset = zoneOffsetMs(timeZone, new Date(wallAsUtc));
  if (offset === null) return new Date(wallAsUtc);
  return new Date(wallAsUtc - offset);
}
