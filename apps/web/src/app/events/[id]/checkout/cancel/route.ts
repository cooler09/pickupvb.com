import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, updateTag } from 'next/cache';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { eventCacheTag } from '@/lib/cache-tags';
import { log } from '@/lib/log';

/**
 * Stripe `cancel_url` lands here. When a buyer abandons checkout, we
 * release the `pending` event_attendees row they reserved at the start of
 * `startTicketCheckout` so the spot is freed and the UI no longer says
 * they're signed up.
 *
 * Matched by Stripe session id (passed via `?session={CHECKOUT_SESSION_ID}`).
 * If the row was already flipped to `paid` by the webhook in a race, we
 * leave it alone.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: eventId } = await params;
  const sessionId = req.nextUrl.searchParams.get('session') ?? undefined;
  const origin = req.nextUrl.origin;

  if (sessionId) {
    const admin = getAdminSupabase();
    // session_id is globally unique — look up the payment row first,
    // then delete the participant (payment cascades).
    const { data: payRow } = await admin
      .from('event_participant_payments')
      .select('participant_id')
      .eq('checkout_session_id', sessionId)
      .eq('payment_status', 'pending')
      .maybeSingle();
    const pid = (payRow as { participant_id: string } | null)?.participant_id;
    const { error } = pid
      ? await admin.from('event_participants').delete().eq('id', pid)
      : { error: null };
    if (error) {
      log.warn('[checkout/cancel] release pending failed', {
        error: error.message,
        eventId,
        sessionId,
      });
    } else if (pid) {
      // Freed a reserved spot — evict the event-detail cache so the re-opened
      // capacity shows immediately (same eviction the expired webhook does).
      // Guarded so a revalidation hiccup can't break the redirect.
      try {
        updateTag(eventCacheTag(eventId));
        revalidatePath(`/events/${eventId}`);
      } catch (revalErr) {
        log.warn('[checkout/cancel] revalidate failed', {
          eventId,
          err: String(revalErr),
        });
      }
    }
  }

  return NextResponse.redirect(`${origin}/events/${eventId}?rsvp=cancel`);
}
