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

/**
 * "Sat, Jun 7" — weekday + date with **no time**, for all-day listings on
 * cards (the time is deliberately omitted because it isn't known).
 */
export function formatEventDay(d: Date | string, timeZone?: TZ): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  });
}

/** "Sat, Jun 7, 2026" — all-day variant of `formatEventDateLong` (no time). */
export function formatEventDayLong(d: Date | string, timeZone?: TZ): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
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

/** Calendar-day ordinal (days since epoch) for a date in the given tz. */
function dayOrdinal(d: Date, timeZone: TZ): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const val = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Math.floor(Date.UTC(val('year'), val('month') - 1, val('day')) / 86_400_000);
}

/**
 * Relative day label for an event start, anchored to the **event's own
 * timezone** (so "Today" means the event is today where it's held): "Today" /
 * "Tomorrow" for 0–1 days out, the short weekday ("Sat") for 2–6 days out,
 * else null (caller shows the absolute date). `now` is passed in — computed at
 * the server page boundary — so this stays pure (no `Date.now()` in render,
 * per the React Compiler purity rule).
 */
export function relativeEventDay(d: Date | string, timeZone: TZ, now: Date): string | null {
  const date = d instanceof Date ? d : new Date(d);
  const diff = dayOrdinal(date, timeZone) - dayOrdinal(now, timeZone);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff >= 2 && diff <= 6) {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      ...(timeZone ? { timeZone } : {}),
    });
  }
  return null;
}

/**
 * Coarse "when" bucket for grouping an upcoming event list — Today / Tomorrow /
 * This week / Next week / Later. The day-diff is measured in the **event's own
 * timezone** (so "Today" means today where the event is held), against `now`
 * (passed in so the render stays pure — AGENTS pattern #4). `order` is for
 * sorting the buckets; `label` is the section heading. Anything already in the
 * past collapses into the soonest bucket (`order` 0) — callers only group the
 * upcoming view.
 */
export function eventBucket(
  d: Date | string,
  timeZone: TZ,
  now: Date,
): { order: number; label: string } {
  const date = d instanceof Date ? d : new Date(d);
  const diff = dayOrdinal(date, timeZone) - dayOrdinal(now, timeZone);
  if (diff <= 0) return { order: 0, label: 'Today' };
  if (diff === 1) return { order: 1, label: 'Tomorrow' };
  if (diff <= 6) return { order: 2, label: 'This week' };
  if (diff <= 13) return { order: 3, label: 'Next week' };
  return { order: 4, label: 'Later' };
}
