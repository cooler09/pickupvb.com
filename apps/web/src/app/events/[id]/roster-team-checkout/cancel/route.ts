import { NextResponse, type NextRequest } from 'next/server';

/**
 * Stripe `cancel_url` for roster-mode per-team captain checkout. Mirror
 * of `team-checkout/cancel` — see that file for the rationale.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: eventId } = await params;
  return NextResponse.redirect(`${req.nextUrl.origin}/events/${eventId}?rsvp=team_cancelled`);
}
