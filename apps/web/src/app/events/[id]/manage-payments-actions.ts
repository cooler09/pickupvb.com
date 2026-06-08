'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { GetEventDetailQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getViewer } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import { getEventPricing } from '@/lib/event-pricing';

/**
 * Host-only: flip an attendee's payment_status between 'none' and 'paid'.
 * Used when payment happens out-of-band (cash, Venmo, etc.).
 *
 * Refuses to touch attendees who paid through Stripe (payment_intent_id is
 * set) — those need to go through the refund flow so the money actually
 * moves. Writes an audit row either way.
 *
 * Bound from the JSX as `setAttendeePaymentStatus.bind(null, eventId, userId, status)`.
 */
export async function setAttendeePaymentStatus(
  eventId: string,
  userId: string,
  status: 'paid' | 'none',
): Promise<void> {
  const viewer = await getViewer();
  if (!viewer || viewer.isAnonymous) return;

  // Authorize via the read model (host / co-host / group admin).
  const detail = await handlers.getEventDetail.execute(
    new GetEventDetailQuery(eventId, viewer.user.id),
  );
  if (!detail.canManage) return;

  const pricing = await getEventPricing(eventId);
  if (!pricing || pricing.priceCents === 0) return;

  // RLS: writes are authorized by host policies on event_participants /
  // event_participant_payments. The canManage check above is
  // belt-and-suspenders; if it ever regresses, RLS still blocks
  // cross-event writes.
  const supabase = await getServerSupabase();
  const { data: row } = await supabase
    .from('event_participants')
    .select(
      'id, payment:event_participant_payments(payment_status, payment_intent_id, amount_paid_cents)',
    )
    .eq('role', 'attendee')
    .eq('division_id', pricing.divisionId)
    .eq('user_id', userId)
    .maybeSingle();
  type EmbedRow = {
    id: string;
    payment: {
      payment_status: string;
      payment_intent_id: string | null;
      amount_paid_cents: number;
    } | null;
  };
  const embed = row as unknown as EmbedRow | null;
  if (!embed) return;
  const r = {
    payment_status: embed.payment?.payment_status ?? 'pending',
    payment_intent_id: embed.payment?.payment_intent_id ?? null,
    amount_paid_cents: embed.payment?.amount_paid_cents ?? 0,
  };
  // Don't mess with Stripe-paid rows — those need the refund flow.
  if (r.payment_intent_id) return;

  const amountCents = status === 'paid' ? pricing.priceCents : 0;
  const { error: updErr } = await supabase.from('event_participant_payments').upsert(
    {
      participant_id: embed.id,
      payment_status: status,
      amount_paid_cents: amountCents,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
    },
    { onConflict: 'participant_id' },
  );
  if (updErr) return;

  await supabase.from('event_payment_audit').insert({
    event_id: eventId,
    user_id: userId,
    action: status === 'paid' ? 'paid' : 'refunded',
    amount_cents: status === 'paid' ? pricing.priceCents : r.amount_paid_cents,
    // Paid out-of-band (cash / Venmo) — no Stripe charge, no platform fee. The
    // flag keeps it out of the earnings fee math and lets a cash paid/refund
    // pair net by (event_id, user_id). See receipts-tax R-5 / R-6.
    off_platform: true,
  });

  revalidatePath(`/events/${eventId}`);
  const flash = status === 'paid' ? 'Attendee marked as paid.' : 'Attendee marked as unpaid.';
  redirect(`/events/${eventId}?flash=${encodeURIComponent(flash)}&flashType=success`);
}
