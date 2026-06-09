import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, updateTag } from 'next/cache';
import { RegistrationPaymentStatus, EventTeamPaymentId } from '@pickupvb/domain';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { repositories } from '@/lib/handlers';
import { eventCacheTag } from '@/lib/cache-tags';
import { log } from '@/lib/log';

/**
 * Stripe `success_url` lands here after a roster-mode captain completes
 * per-team payment. Sibling of `team-checkout/success` (ad-hoc mode).
 * The webhook is authoritative; this route reconciles synchronously to
 * cover the redirect-vs-webhook race common in `stripe listen` dev mode.
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
      payment_id?: string;
      event_id?: string;
    };
    if (meta.kind !== 'roster_team_payment' || !meta.payment_id || meta.event_id !== eventId) {
      return redirectBack();
    }

    const { eventTeamPaymentRepo } = repositories;
    const payment = await eventTeamPaymentRepo.findById(EventTeamPaymentId(meta.payment_id));
    if (!payment) return redirectBack();

    if (payment.paymentStatus === RegistrationPaymentStatus.Paid) {
      return redirectBack('team_paid');
    }

    const piId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);
    if (!piId) return redirectBack('team_pending');

    try {
      payment.markPaid({
        paymentIntentId: piId,
        amountCents: session.amount_total ?? 0,
        paidAt: new Date(),
      });
      await eventTeamPaymentRepo.save(payment);
      // The team-payment status is cached under eventCacheTag for every viewer
      // (loadAdHocRowsCached). When this redirect beats the webhook, evict it
      // here too or the captain sees "Pay now" until the 60s TTL. Guarded so a
      // revalidation hiccup can't break the redirect.
      try {
        updateTag(eventCacheTag(eventId));
        revalidatePath(`/events/${eventId}`);
      } catch (revalErr) {
        log.warn('[roster-team-checkout/success] revalidate failed', {
          eventId,
          err: String(revalErr),
        });
      }
    } catch (err) {
      // Webhook already won the race — fine.
      void err;
    }
  } catch (err) {
    log.warn('[roster-team-checkout/success] reconcile failed', {
      error: err instanceof Error ? err.message : String(err),
      eventId,
      sessionId,
    });
  }

  return redirectBack();
}
