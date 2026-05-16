'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
    JoinEventCommand,
    JoinEventWithPositionCommand,
    LeaveEventCommand,
} from '@pickupvb/application';
import {
    CapacityExceededError,
    ConflictError,
    InvariantViolation,
    NotFoundError,
    ValidationError,
} from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { redirectEventNotice } from '@/lib/server-redirects';
import { log } from '@/lib/log';

/**
 * Server action wrappers around JoinEventCommand / LeaveEventCommand that
 * translate domain errors into a flash banner via `?rsvp=…` instead of
 * blowing up the page. Used by the "Join this event" / "Leave event"
 * buttons on /events/[id].
 *
 * Flash codes:
 *   joined   — newly RSVPed
 *   already  — RSVP attempted but the user was already in
 *   full     — event capacity is exhausted
 *   left     — successfully removed from the event
 *   notin    — leave attempted but the user wasn't in the event
 *   signin   — no session
 *   anon     — anonymous session (must convert to a real account first)
 *   error    — anything else (last_error string also set)
 */
function back(eventId: string, code: string, msg?: string): never {
    redirectEventNotice(eventId, 'rsvp', code, msg);
}

async function authedUserIdOrFlash(eventId: string): Promise<string> {
    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) back(eventId, 'signin');
    if ((user as { is_anonymous?: boolean }).is_anonymous) back(eventId, 'anon');
    return user.id;
}

/** Allows anonymous-auth users (e.g. guest paid-ticket buyers) to leave. */
async function userIdOrFlash(eventId: string): Promise<string> {
    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) back(eventId, 'signin');
    return user.id;
}

export async function joinEvent(eventId: string): Promise<void> {
    const userId = await authedUserIdOrFlash(eventId);
    try {
        await handlers.joinEvent.execute(new JoinEventCommand(eventId, userId));
    } catch (err) {
        if (err instanceof ConflictError) {
            revalidatePath(`/events/${eventId}`);
            back(eventId, 'already');
        }
        if (err instanceof CapacityExceededError) back(eventId, 'full');
        const m = err instanceof Error ? err.message : String(err);
        back(eventId, 'error', m);
    }
    revalidatePath(`/events/${eventId}`);
    back(eventId, 'joined');
}

export async function leaveEvent(eventId: string): Promise<void> {
    const userId = await userIdOrFlash(eventId);

    // If this is a paid attendee, refund through Stripe BEFORE removing the
    // row. The `charge.refunded` webhook will delete the row + free capacity
    // and write the audit log entry, so we just need to make the refund call
    // and bounce the user back to the event page. Outside the refund window
    // (now > starts_at - refund_window_hours), we still let them leave but
    // do not refund — they should reach out to the host.
    const admin = getAdminSupabase();
    const { data: row } = await admin
        .from('event_attendees')
        .select('payment_status, payment_intent_id')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .maybeSingle();
    type AttRow = { payment_status: string; payment_intent_id: string | null };
    const att = row as unknown as AttRow | null;

    if (att?.payment_status === 'paid' && att.payment_intent_id && isStripeConfigured()) {
        const { data: ev } = await admin
            .from('events')
            .select('starts_at, refund_window_hours')
            .eq('id', eventId)
            .maybeSingle();
        type EvRow = { starts_at: string; refund_window_hours: number };
        const e = ev as unknown as EvRow | null;
        const startsAt = e ? new Date(e.starts_at).getTime() : 0;
        const windowMs = (e?.refund_window_hours ?? 0) * 60 * 60 * 1000;
        const cutoff = startsAt - windowMs;
        if (Date.now() > cutoff) {
            back(
                eventId,
                'error',
                'Refund window has closed. Contact the host to cancel.',
            );
        }
        try {
            const stripe = getStripe();
            await stripe.refunds.create({
                payment_intent: att.payment_intent_id,
                reason: 'requested_by_customer',
                refund_application_fee: true,
                reverse_transfer: true,
            });
        } catch (err) {
            await log.error('[leave] refund failed', err, { eventId, userId });
            const m = err instanceof Error ? err.message : 'Refund failed.';
            back(eventId, 'error', m);
        }
        // Webhook handles row deletion + audit; bounce optimistically.
        revalidatePath(`/events/${eventId}`);
        back(eventId, 'left');
    }

    try {
        await handlers.leaveEvent.execute(new LeaveEventCommand(eventId, userId));
    } catch (err) {
        if (err instanceof NotFoundError) {
            revalidatePath(`/events/${eventId}`);
            back(eventId, 'notin');
        }
        const m = err instanceof Error ? err.message : String(err);
        back(eventId, 'error', m);
    }
    revalidatePath(`/events/${eventId}`);
    back(eventId, 'left');
}

/**
 * Sign up at a specific volleyball position. Used for open-play events
 * whose host configured a position roster. Over-fill is allowed (waitlist
 * style) so this only errors on capacity_exceeded as a safety net.
 *
 * Bound from the JSX as `joinEventAtPosition.bind(null, eventId, position)`.
 */
export async function joinEventAtPosition(
    eventId: string,
    position: string,
): Promise<void> {
    const userId = await authedUserIdOrFlash(eventId);
    try {
        await handlers.joinEventWithPosition.execute(
            new JoinEventWithPositionCommand(eventId, userId, position),
        );
    } catch (err) {
        if (err instanceof ConflictError) {
            revalidatePath(`/events/${eventId}`);
            back(eventId, 'already');
        }
        if (err instanceof CapacityExceededError) back(eventId, 'full');
        if (err instanceof ValidationError || err instanceof InvariantViolation) {
            back(eventId, 'error', err.message);
        }
        if (err instanceof NotFoundError) back(eventId, 'error', err.message);
        const m = err instanceof Error ? err.message : String(err);
        back(eventId, 'error', m);
    }
    revalidatePath(`/events/${eventId}`);
    back(eventId, 'joined');
}
