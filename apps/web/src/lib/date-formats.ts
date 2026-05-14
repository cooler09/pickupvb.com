/**
 * Centralized date/time formatters for the UI. Locale-aware via the
 * runtime's default locale; pass an explicit locale if needed.
 */

/** "Sat, Jun 7, 6:30 PM" — used in event listings. */
export function formatEventStart(d: Date | string): string {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

/** "Sat, Jun 7, 2026, 6:30 PM" — used on event detail pages. */
export function formatEventDateLong(d: Date | string): string {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

/** "6:30 PM" — used for times when the date is shown elsewhere. */
export function formatTime(d: Date | string): string {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Jun 7, 2026" — used where a compact date suffices. */
export function formatDateShort(d: Date | string): string {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}
