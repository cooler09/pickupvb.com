import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase-admin';
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
    // session_id is globally unique — no need to scope by event_id
    // (which no longer exists on event_attendees after Step 5a).
    const { error } = await admin
      .from('event_attendees')
      .delete()
      .eq('checkout_session_id', sessionId)
      .eq('payment_status', 'pending');
    if (error) {
      log.warn('[checkout/cancel] release pending failed', {
        error: error.message,
        eventId,
        sessionId,
      });
    }
  }

  return NextResponse.redirect(`${origin}/events/${eventId}?rsvp=cancel`);
}
