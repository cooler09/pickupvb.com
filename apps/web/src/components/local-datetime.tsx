'use client';

import { useEffect, useState } from 'react';

import {
  formatDateShort,
  formatEventDateLong,
  formatEventStart,
  formatTime,
} from '@/lib/date-formats';

type Variant = 'eventStart' | 'eventDateLong' | 'time' | 'dateShort';

const FORMATTERS: Record<Variant, (d: Date) => string> = {
  eventStart: formatEventStart,
  eventDateLong: formatEventDateLong,
  time: formatTime,
  dateShort: formatDateShort,
};

/**
 * Renders a date/time string in the viewer's browser timezone. The server
 * renders the `fallback` (default: empty) inside a `<time dateTime=ISO>`;
 * after hydration the locale-formatted string takes over. This avoids
 * showing the server's UTC interpretation of the instant.
 *
 * NOTE: This shows the viewer's local time. For events tied to a physical
 * venue, venue-local time would be more correct, but requires storing the
 * event's timezone alongside the instant.
 */
export function LocalDateTime({
    iso,
    variant = 'eventStart',
    fallback,
    className,
}: {
    iso: string | Date;
    variant?: Variant;
    /** Text to show during SSR / before hydration. Defaults to empty. */
    fallback?: string;
    className?: string;
}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const date = iso instanceof Date ? iso : new Date(iso);
    const isoAttr = date.toISOString();

    return (
        <time dateTime={isoAttr} suppressHydrationWarning className={className}>
            {mounted ? FORMATTERS[variant](date) : (fallback ?? '')}
        </time>
    );
}
