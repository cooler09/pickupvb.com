'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { JoinEventCommand, LeaveEventCommand } from '@pickupvb/application';
import {
    CapacityExceededError,
    ConflictError,
    NotFoundError,
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
