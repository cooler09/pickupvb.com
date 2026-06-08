'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  JoinEventCommand,
  JoinEventWithPositionCommand,
  JoinWaitlistCommand,
  LeaveEventCommand,
  LeaveWaitlistCommand,
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
      .select('title, starts_at, location_city, location_region, time_zone')
      .eq('id', eventId)
      .maybeSingle();
    const e = ev as {
      title: string;
      starts_at: string;
      location_city: string | null;
      location_region: string | null;
      time_zone: string | null;
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
          ...(e.time_zone ? { timeZone: e.time_zone } : {}),
        },
        { idempotencyKey: `${eventId}:${userId}` },
      );
    }
  } catch {
    // best-effort
  }

  revalidatePath(`/events/${eventId}`);
  back(eventId, 'joined');
}

export async function leaveEvent(eventId: string): Promise<void> {
  const userId = await userIdOrFlash(eventId);

  // If this is a paid attendee, refund through Stripe BEFORE removing the
  // row. The `charge.refunded` webhook will delete the row + free capacity
  // and write the audit log entry, so we just need to make the refund call
  // and bounce the user back to the event page.
  const outcome = await refundAttendeeTicket(eventId, userId);
  if (outcome.kind === 'refunded') {
    // Webhook handles row deletion + audit; bounce optimistically.
    revalidatePath(`/events/${eventId}`);
    await captureEventLeft(eventId, userId);
    back(eventId, 'left');
  }
  // The window closed between page render and click (race): the user
  // expected a refund, so don't forfeit their spot — keep them in and
  // point them at the host. (The panel pre-empts this with the "no refund"
  // variant once the window is known-closed at render time.)
  if (outcome.kind === 'window_closed') back(eventId, 'refund_window_closed');
  // Stripe rejected the reversal (transient error, or the host's account
  // can no longer receive it). Keep them signed up and surface friendly
  // copy instead of the raw Stripe message (already logged in refundAttendeeTicket).
  if (outcome.kind === 'failed') back(eventId, 'refund_failed');
  // outcome.kind === 'not_paid' → fall through to the plain leave.

  await plainLeave(eventId, userId);
}

/**
 * The "Cancel sign-up (no refund)" variant. The attendee has already
 * confirmed (in the panel's confirm dialog) that no refund will be issued —
 * this fires when a refund can't run in-app at all: an off-platform charge
 * with nothing to reverse, the host's Stripe Connect account is gone, or
 * we're past the refund window. Skip the Stripe attempt entirely and just
 * release the spot; the host can still refund out-of-band from their
 * dashboard. Bound from the JSX as `leaveEventNoRefund.bind(null, eventId)`.
 */
export async function leaveEventNoRefund(eventId: string): Promise<void> {
  const userId = await userIdOrFlash(eventId);
  await plainLeave(eventId, userId);
}

/**
 * Remove the viewer from the event with no refund side-effects: run
 * `LeaveEventCommand`, notify any auto-promoted waitlister (ADR 0036),
 * revalidate, and flash `left`. Always terminates in a redirect (`back`),
 * so it never returns normally.
 */
async function plainLeave(eventId: string, userId: string): Promise<void> {
  let promotedUserId: string | null = null;
  try {
    const result = await handlers.leaveEvent.execute(new LeaveEventCommand(eventId, userId));
    promotedUserId = result.promotedUserId;
  } catch (err) {
    if (err instanceof NotFoundError) {
      revalidatePath(`/events/${eventId}`);
      back(eventId, 'notin');
    }
    const m = err instanceof Error ? err.message : String(err);
    back(eventId, 'error', m);
  }

  // The freed seat may have auto-promoted the head of the capacity waitlist
  // (ADR 0036). Notify them their spot is confirmed — best-effort; a missed
  // ping never loses the seat (the promotion already persisted).
  if (promotedUserId) await notifyWaitlistPromotion(eventId, promotedUserId);

  revalidatePath(`/events/${eventId}`);
  back(eventId, 'left');
}

/** Best-effort `event.waitlist.promoted` ping after an auto-promotion. */
async function notifyWaitlistPromotion(eventId: string, promotedUserId: string): Promise<void> {
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase
      .from('events')
      .select('title, starts_at, time_zone')
      .eq('id', eventId)
      .maybeSingle();
    const e = data as { title: string; starts_at: string; time_zone: string | null } | null;
    if (!e) return;
    await notify(
      'event.waitlist.promoted',
      promotedUserId,
      {
        eventId,
        eventTitle: e.title,
        startsAt: e.starts_at,
        ...(e.time_zone ? { timeZone: e.time_zone } : {}),
      },
      { idempotencyKey: `${eventId}:${promotedUserId}:${e.starts_at}` },
    );
  } catch {
    // best-effort
  }
}

/**
 * Join the capacity waitlist of a full open-play event (ADR 0036). The
 * "Join waitlist" CTA on a full event posts here instead of the dead-end
 * `?rsvp=full`. Flash: `waitlisted` on success.
 */
export async function joinWaitlist(eventId: string): Promise<void> {
  const userId = await authedUserIdOrFlash(eventId);
  try {
    await handlers.joinWaitlist.execute(new JoinWaitlistCommand(eventId, userId));
  } catch (err) {
    if (err instanceof ConflictError) {
      revalidatePath(`/events/${eventId}`);
      back(eventId, 'already');
    }
    // A spot opened between the page render and the click → the event isn't full
    // anymore. Nudge them to just join.
    if (err instanceof InvariantViolation) back(eventId, 'error', err.message);
    const m = err instanceof Error ? err.message : String(err);
    back(eventId, 'error', m);
  }
  revalidatePath(`/events/${eventId}`);
  back(eventId, 'waitlisted');
}

/** Leave the capacity waitlist (ADR 0036). Flash: `left_waitlist`. */
export async function leaveWaitlist(eventId: string): Promise<void> {
  const userId = await userIdOrFlash(eventId);
  try {
    await handlers.leaveWaitlist.execute(new LeaveWaitlistCommand(eventId, userId));
  } catch (err) {
    if (err instanceof NotFoundError) {
      revalidatePath(`/events/${eventId}`);
      back(eventId, 'notin');
    }
    const m = err instanceof Error ? err.message : String(err);
    back(eventId, 'error', m);
  }
  revalidatePath(`/events/${eventId}`);
  back(eventId, 'left_waitlist');
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
  back(eventId, 'joined');
}

/**
 * Loads the minimum event metadata needed to populate the typed event
 * analytics props (host id, metro, default-division price). Returns
 * `null` if the event isn't visible to the current viewer; callers
 * should treat that as "skip capture" (analytics must not break the
 * request). Used by the refund-path `captureEventLeft` — the unpaid
 * leave and the two `joinEvent*` paths now emit through the
 * application-layer outbox (Bundle 80).
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
 * Best-effort capture of the `event_left` analytics event from the
 * refund-success path only. The Stripe webhook deletes the
 * `event_attendees` row out-of-band, so this path never runs through
 * {@link handlers.leaveEvent} — the application-layer outbox added in
 * Bundle 80 doesn't see it. Capture here so refund-driven leaves still
 * land in PostHog; revisit when the webhook starts dispatching through
 * `LeaveEventCommand`.
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
