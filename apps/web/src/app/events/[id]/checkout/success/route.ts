import { NextResponse, type NextRequest } from 'next/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { log } from '@/lib/log';

/**
 * Stripe `success_url` lands here. The `checkout.session.completed` webhook
 * is the authoritative source of truth for marking an attendee `paid`, but
 * it's asynchronous — in dev it requires `stripe listen`, and even in prod
 * it can race the redirect. Without this route, a user who just paid sees
 * "payment pending" for a few seconds (or indefinitely, locally).
 *
 * Here we retrieve the session synchronously, and if Stripe says it's paid,
 * flip the attendee row right away. The webhook still runs later and is
 * idempotent (UPDATE with same data).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: eventId } = await params;
  const sessionId = req.nextUrl.searchParams.get('session') ?? undefined;
  const origin = req.nextUrl.origin;
  const redirectBack = (rsvp = 'joined'): NextResponse =>
    NextResponse.redirect(`${origin}/events/${eventId}?rsvp=${rsvp}`);

  if (!sessionId || !isStripeConfigured()) return redirectBack();

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      const meta = (session.metadata ?? {}) as {
        event_id?: string;
        user_id?: string;
        kind?: string;
      };
      if (meta.kind === 'attendee' && meta.user_id && meta.event_id === eventId) {
        const admin = getAdminSupabase();
        const piId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);
        await admin
          .from('event_attendees')
          .update({
            payment_status: 'paid',
            payment_intent_id: piId,
            amount_paid_cents: session.amount_total ?? 0,
            paid_at: new Date().toISOString(),
          } as never)
          .eq('checkout_session_id', session.id)
          .neq('payment_status', 'paid');
      }
    }
  } catch (err) {
    log.warn('[checkout/success] reconcile failed', {
      error: err instanceof Error ? err.message : String(err),
      eventId,
      sessionId,
    });
  }

  return redirectBack();
}
