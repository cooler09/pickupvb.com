'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { eventCacheTag } from '@/lib/cache-tags';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { refundAttendeeTicket } from '@/lib/refund-ticket';
import { notify } from '@/lib/notify';
import { GetEventDetailQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { field } from '@/lib/form-data';
import { log } from '@/lib/log';

type State = { error?: string; ok?: boolean };

/**
 * Cancel an event. Host-only.
 *
 * Sequence:
 *   1. Re-authorize via the read model (`canManage`).
 *   2. Set `status='cancelled'` so the page renders the cancelled badge
 *      and signups close.
 *   3. Refund every paid attendee. Failures are logged but don't halt the
 *      cancellation — the host can manually refund stragglers from Stripe.
 *   4. Notify every attendee with the host-supplied reason (optional).
 *
 * No rollback if step 2 succeeds but later steps partially fail: the
 * event stays cancelled, attendees may have been notified or not. This
 * matches user intent ("the event is off").
 */
export async function cancelEventAction(
  eventId: string,
  _prev: State,
  formData: FormData,
): Promise<State> {
  const reason = (field(formData, 'reason') ?? '').trim().slice(0, 500) || null;

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You must be signed in.' };

  let detail;
  try {
    detail = await handlers.getEventDetail.execute(new GetEventDetailQuery(eventId, user.id));
  } catch {
    return { error: 'Event not found.' };
  }
  if (!detail.canManage) return { error: 'You do not have permission.' };
  if (detail.status === 'cancelled') return { error: 'Event already cancelled.' };

  const admin = getAdminSupabase();

  // Snapshot attendees BEFORE refund (refunds delete rows).
  const { data: attRows } = await admin
    .from('event_participants')
    .select(
      'user_id, payment:event_participant_payments(payment_status), division:event_divisions!inner(event_id)',
    )
    .eq('role', 'attendee')
    .eq('division.event_id', eventId);
  const attendees =
    (attRows as { user_id: string; payment: { payment_status: string } | null }[] | null)?.map(
      (a) => ({
        user_id: a.user_id,
        payment_status: a.payment?.payment_status ?? 'pending',
      }),
    ) ?? [];

  // Mark cancelled. RLS allows hosts to update their own event; we use the
  // user-session client to keep that audit trail.
  const { error: updErr } = await supabase
    .from('events')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', eventId);
  if (updErr) return { error: `Cancellation failed: ${updErr.message}` };

  // Refund paid attendees. Best-effort.
  for (const a of attendees) {
    if (a.payment_status !== 'paid') continue;
    try {
      const outcome = await refundAttendeeTicket(eventId, a.user_id);
      if (outcome.kind === 'failed' || outcome.kind === 'window_closed') {
        await log.warn('[cancel-event] refund skipped', {
          eventId,
          userId: a.user_id,
          outcome,
        });
      }
    } catch (err) {
      await log.error('[cancel-event] refund error', err, {
        eventId,
        userId: a.user_id,
      });
    }
  }

  // Notify everyone (paid or unpaid). Idempotency per attendee.
  for (const a of attendees) {
    if (a.user_id === user.id) continue;
    await notify(
      'event.cancelled',
      a.user_id,
      {
        eventId,
        eventTitle: detail.title,
        startsAt: detail.startsAt.toISOString(),
        reason,
      },
      { idempotencyKey: `cancel:${eventId}:${a.user_id}` },
    );
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/events');
  updateTag(eventCacheTag(eventId));
  redirect(`/events/${eventId}`);
}
