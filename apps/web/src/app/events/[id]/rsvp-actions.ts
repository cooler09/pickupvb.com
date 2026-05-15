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
    const params = new URLSearchParams({ rsvp: code });
    if (msg) params.set('rsvp_msg', msg);
    redirect(`/events/${eventId}?${params.toString()}`);
}

async function authedUserIdOrFlash(eventId: string): Promise<string> {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) back(eventId, 'signin');
    if ((user as { is_anonymous?: boolean }).is_anonymous) back(eventId, 'anon');
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
    const userId = await authedUserIdOrFlash(eventId);
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
