import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Resolve the request's absolute origin (scheme + host) for building
 * Stripe success/cancel URLs. Falls back to localhost in dev when neither
 * header is present.
 */
export async function buildOrigin(): Promise<string> {
    const h = await headers();
    return (
        h.get('origin') ??
        (h.get('host') ? `https://${h.get('host')}` : 'http://localhost:3000')
    );
}

/**
 * Redirect back to an event page with a `?<key>=<code>` (and optional
 * `?<key>_msg=<msg>`) flash. Used by paid-event server actions to surface
 * outcomes via querystring — the page renders a banner from these params.
 *
 * Keys in use:
 *   - 'rsvp'  → RSVP / checkout outcomes
 *   - 'tip'   → tip-jar outcomes
 *   - 'fa'    → free-agent signup outcomes
 */
export function redirectEventNotice(
    eventId: string,
    key: 'rsvp' | 'tip' | 'fa',
    code: string,
    msg?: string,
): never {
    const params = new URLSearchParams({ [key]: code });
    if (msg) params.set(`${key}_msg`, msg);
    redirect(`/events/${eventId}?${params.toString()}`);
}
