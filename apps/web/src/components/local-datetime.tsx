'use client';

import {
  formatDateShort,
  formatEventDateLong,
  formatEventStart,
  formatTime,
} from '@/lib/date-formats';
import { useIsMounted } from '@/lib/use-is-mounted';

type Variant = 'eventStart' | 'eventDateLong' | 'time' | 'dateShort';

const FORMATTERS: Record<Variant, (d: Date, tz?: string | null) => string> = {
  eventStart: formatEventStart,
  eventDateLong: formatEventDateLong,
  time: formatTime,
  dateShort: formatDateShort,
};

/**
 * Renders a date/time string. If `timeZone` is provided (an IANA name
 * derived from the venue coords), the date is rendered in that zone — so
 * every viewer sees "6:30 PM PST" for a Seattle event regardless of
 * where they are. If omitted, falls back to the viewer's browser
 * timezone. The server renders the `fallback` (default: empty) inside a
 * `<time dateTime=ISO>`; after hydration the locale-formatted string
 * takes over.
 */
export function LocalDateTime({
  iso,
  variant = 'eventStart',
  timeZone,
  fallback,
  className,
}: {
  iso: string | Date;
  variant?: Variant;
  /** IANA timezone name (e.g. `America/Los_Angeles`). */
  timeZone?: string | null;
  /** Text to show during SSR / before hydration. Defaults to empty. */
  fallback?: string;
  className?: string;
}) {
  const mounted = useIsMounted();

  const date = iso instanceof Date ? iso : new Date(iso);
  const isoAttr = date.toISOString();

  return (
    <time dateTime={isoAttr} suppressHydrationWarning className={className}>
      {mounted ? FORMATTERS[variant](date, timeZone) : (fallback ?? '')}
    </time>
  );
}
