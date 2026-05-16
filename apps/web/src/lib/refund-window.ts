import 'server-only';
import { getAdminSupabase } from './supabase-admin';

/**
 * Check whether `now` is still inside the event's refund window
 * (starts_at − refund_window_hours). Returns `{ ok: true }` when a refund
 * is allowed, or `{ ok: false, reason }` with a user-facing message.
 *
 * Used by `leaveEvent` to gate the Stripe refund call. The event row is
 * loaded via the admin client because `event_attendees`-related queries in
 * the same action use admin too; if the event can't be found we err on the
 * safe side and refuse the refund.
 */
export async function assertWithinRefundWindow(
    eventId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    const admin = getAdminSupabase();
    const { data } = await admin
        .from('events')
        .select('starts_at, refund_window_hours')
        .eq('id', eventId)
        .maybeSingle();
    type Row = { starts_at: string; refund_window_hours: number };
    const ev = data as unknown as Row | null;
    if (!ev) {
        return { ok: false, reason: 'Event not found.' };
    }
    const startsAt = new Date(ev.starts_at).getTime();
    const windowMs = (ev.refund_window_hours ?? 0) * 60 * 60 * 1000;
    const cutoff = startsAt - windowMs;
    if (Date.now() > cutoff) {
        return {
            ok: false,
            reason: 'Refund window has closed. Contact the host to cancel.',
        };
    }
    return { ok: true };
}
