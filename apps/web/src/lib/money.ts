/**
 * Money-input parsers used by event create/edit forms.
 *
 * All values are stored in integer cents in the DB; the form exposes USD.
 * These helpers centralize the rounding + clamping rules so they don't drift
 * between `/events/new` and `/events/[id]/edit`.
 */

/** Refund-window cap: 30 days expressed in hours. */
export const MAX_REFUND_WINDOW_HOURS = 720;
/** Default refund window when the form leaves it blank. */
export const DEFAULT_REFUND_WINDOW_HOURS = 24;

/**
 * Parse a USD string from a form field into integer cents.
 * Empty / non-numeric input → 0 (meaning "free event").
 */
export function parsePriceCents(raw: string | undefined): number {
    if (!raw) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.round(n * 100));
}

/**
 * Parse a refund-window hours form field. Clamps to [0, MAX] and falls back
 * to the default if missing/invalid.
 */
export function parseRefundWindowHours(raw: string | undefined): number {
    if (!raw) return DEFAULT_REFUND_WINDOW_HOURS;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_REFUND_WINDOW_HOURS;
    return Math.max(0, Math.min(MAX_REFUND_WINDOW_HOURS, Math.round(n)));
}
