import { NextResponse, type NextRequest } from 'next/server';
import { RegistrationPaymentStatus, type EventTeamRegistrationId } from '@pickupvb/domain';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { repositories } from '@/lib/handlers';
import { log } from '@/lib/log';

/**
 * Stripe `success_url` lands here after the captain completes per-team
 * payment. The `checkout.session.completed` webhook is authoritative, but
 * in dev (`stripe listen`) and even in prod the redirect can race the
 * webhook. We retrieve the session synchronously and apply the same
 * Pending → Paid transition via the aggregate; the webhook is idempotent
 * (markPaid is rejected from Paid via InvariantViolation, which we swallow).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: eventId } = await params;
  const sessionId = req.nextUrl.searchParams.get('session') ?? undefined;
  const origin = req.nextUrl.origin;
  const redirectBack = (code = 'team_paid'): NextResponse =>
    NextResponse.redirect(`${origin}/events/${eventId}?rsvp=${code}`);

  if (!sessionId || !isStripeConfigured()) return redirectBack();

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') return redirectBack('team_pending');

    const meta = (session.metadata ?? {}) as {
      kind?: string;
      registration_id?: string;
      event_id?: string;
    };
    if (meta.kind !== 'team_registration' || !meta.registration_id || meta.event_id !== eventId) {
      return redirectBack();
    }

    const { eventTeamRegistrationRepo } = repositories;
    const registration = await eventTeamRegistrationRepo.findById(
      meta.registration_id as never as EventTeamRegistrationId,
    );
    if (!registration) return redirectBack();

    if (registration.paymentStatus === RegistrationPaymentStatus.Paid) {
      return redirectBack('team_paid');
    }

    const piId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);
    if (!piId) return redirectBack('team_pending');

    try {
      registration.markPaid({
        paymentIntentId: piId,
        amountCents: session.amount_total ?? 0,
        paidAt: new Date(),
      });
      await eventTeamRegistrationRepo.save(registration);
    } catch (err) {
      // Webhook already won the race — fine.
      void err;
    }
  } catch (err) {
    log.warn('[team-checkout/success] reconcile failed', {
      error: err instanceof Error ? err.message : String(err),
      eventId,
      sessionId,
    });
  }

  return redirectBack();
}
