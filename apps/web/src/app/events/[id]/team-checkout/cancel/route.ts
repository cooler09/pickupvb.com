import { NextResponse, type NextRequest } from 'next/server';

/**
 * Stripe `cancel_url` lands here when the captain backs out of the hosted
 * page without paying. Stripe will fire `checkout.session.expired` after
 * the 30-minute TTL; until then the registration sits in Pending and the
 * captain can't restart from the UI. We trust the webhook to free the
 * Pending state — this route just bounces back to the event page.
 *
 * If the captain immediately retries from the team page, the cancel URL
 * is harmless: the existing Pending session is still good and Stripe
 * gracefully no-ops.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: eventId } = await params;
  return NextResponse.redirect(`${req.nextUrl.origin}/events/${eventId}?rsvp=team_cancelled`);
}
