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
import { handlers, analytics } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { redirectEventNotice } from '@/lib/server-redirects';
import { refundAttendeeTicket } from '@/lib/refund-ticket';
import { notify } from '@/lib/notify';

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

  // Fire-and-forget notification dispatch. Failures are swallowed.
  try {
    const supabase = await getServerSupabase();
    const { data: ev } = await supabase
      .from('events')
      .select('title, starts_at, location_city, location_region')
      .eq('id', eventId)
      .maybeSingle();
    const e = ev as {
      title: string;
      starts_at: string;
      location_city: string | null;
      location_region: string | null;
    } | null;
    if (e) {
      await notify(
        'event.signup.confirmed',
        userId,
        {
          eventId,
          eventTitle: e.title,
          startsAt: e.starts_at,
          location: [e.location_city, e.location_region].filter(Boolean).join(', '),
        },
        { idempotencyKey: `${eventId}:${userId}` },
      );
    }
  } catch {
    // best-effort
  }

  revalidatePath(`/events/${eventId}`);
  await captureEventJoined(eventId, userId, { byPosition: false, position: null });
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
  const outcome = await refundAttendeeTicket(eventId, userId);
  if (outcome.kind === 'refunded') {
    // Webhook handles row deletion + audit; bounce optimistically.
    revalidatePath(`/events/${eventId}`);
    await captureEventLeft(eventId, userId);
    back(eventId, 'left');
  }
  if (outcome.kind === 'window_closed' || outcome.kind === 'failed') {
    back(eventId, 'error', outcome.reason);
  }
  // outcome.kind === 'not_paid' → fall through to LeaveEventCommand.

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
  await captureEventLeft(eventId, userId);
  back(eventId, 'left');
}

/**
 * Sign up at a specific volleyball position. Used for open-play events
 * whose host configured a position roster. Over-fill is allowed (waitlist
 * style) so this only errors on capacity_exceeded as a safety net.
 *
 * Bound from the JSX as `joinEventAtPosition.bind(null, eventId, position)`.
 */
export async function joinEventAtPosition(eventId: string, position: string): Promise<void> {
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
  await captureEventJoined(eventId, userId, { byPosition: true, position });
  back(eventId, 'joined');
}

/**
 * Loads the minimum event metadata needed to populate the typed event
 * analytics props (host id, metro, default-division price). Returns
 * `null` if the event isn't visible to the current viewer; callers
 * should treat that as "skip capture" (analytics must not break the
 * request). Shared between `captureEventJoined` and `captureEventLeft`.
 */
async function loadEventAnalyticsContext(
  eventId: string,
): Promise<{ hostId: string; priceCents: number; metroId: string | null } | null> {
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase
      .from('events')
      .select('host_id, location_city, event_divisions(price_cents, sort_order)')
      .eq('id', eventId)
      .maybeSingle();
    const row = data as {
      host_id: string;
      location_city: string | null;
      event_divisions: Array<{ price_cents: number | null; sort_order: number }> | null;
    } | null;
    if (!row) return null;
    const defaultDivision = (row.event_divisions ?? []).find((d) => d.sort_order === 0);
    return {
      hostId: row.host_id,
      priceCents: defaultDivision?.price_cents ?? 0,
      metroId: row.location_city ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Best-effort capture of the `event_joined` analytics event. Swallows
 * all errors — analytics must never break a request. See
 * [docs/audits/analytics.md](../../../../../docs/audits/analytics.md).
 */
async function captureEventJoined(
  eventId: string,
  userId: string,
  extras: { byPosition: boolean; position: string | null },
): Promise<void> {
  const ctx = await loadEventAnalyticsContext(eventId);
  if (!ctx) return;
  try {
    analytics.capture(
      {
        name: 'event_joined',
        props: {
          eventId,
          hostId: ctx.hostId,
          eventType: 'open_play',
          byPosition: extras.byPosition,
          priceCents: ctx.priceCents,
          metroId: ctx.metroId,
          waitlist: false,
          position: extras.position,
        },
      },
      userId,
    );
  } catch {
    // best-effort
  }
}

/**
 * Best-effort capture of the `event_left` analytics event. Fires from
 * both the refund-success path and the unpaid-leave fall-through.
 * `byPosition` is reported as `false` — we don't track positional
 * leaves separately yet; revisit when leave-by-position UI exists.
 */
async function captureEventLeft(eventId: string, userId: string): Promise<void> {
  const ctx = await loadEventAnalyticsContext(eventId);
  if (!ctx) return;
  try {
    analytics.capture(
      {
        name: 'event_left',
        props: {
          eventId,
          hostId: ctx.hostId,
          eventType: 'open_play',
          byPosition: false,
          priceCents: ctx.priceCents,
          metroId: ctx.metroId,
        },
      },
      userId,
    );
  } catch {
    // best-effort
  }
}
