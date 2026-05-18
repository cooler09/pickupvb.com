/**
 * Centralized date/time formatters for the UI. Locale-aware via the
 * runtime's default locale; pass an explicit locale if needed.
 *
 * Each formatter accepts an optional `timeZone` (IANA name like
 * `America/Los_Angeles`). When provided, the date is rendered in that
 * zone — so a viewer in NYC sees "6:30 PM PST" for a Seattle event,
 * matching what the host published. When omitted/null, falls back to
 * the viewer's local zone.
 */

type TZ = string | null | undefined;

function tzOpt(timeZone: TZ): { timeZone?: string; timeZoneName?: 'short' } {
  return timeZone ? { timeZone, timeZoneName: 'short' } : {};
}

/** "Sat, Jun 7, 6:30 PM" (or "… 6:30 PM PST" when timeZone is set). */
export function formatEventStart(d: Date | string, timeZone?: TZ): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...tzOpt(timeZone),
  });
}

/** "Sat, Jun 7, 2026, 6:30 PM" — used on event detail pages. */
export function formatEventDateLong(d: Date | string, timeZone?: TZ): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...tzOpt(timeZone),
  });
}

/** "6:30 PM" — used for times when the date is shown elsewhere. */
export function formatTime(d: Date | string, timeZone?: TZ): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...tzOpt(timeZone),
  });
}

/** "Jun 7, 2026" — used where a compact date suffices. */
export function formatDateShort(d: Date | string, timeZone?: TZ): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  });
}
