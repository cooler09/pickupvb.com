/**
 * `checkout.session.*` webhook handlers (architecture audit P3-2 — extracted
 * verbatim from the webhook route). `completed` flips the matching reservation
 * row to paid + audit-logs + fires analytics; `expired` drops the pending
 * reservation so the spot re-opens. Both key off `session.metadata.kind`.
 */
import type Stripe from 'stripe';
import { revalidatePath, updateTag } from 'next/cache';
import { analytics, repositories } from '@/lib/handlers';
import { log } from '@/lib/log';
import { eventCacheTag } from '@/lib/cache-tags';
import {
  expireRosterTeamPaymentCheckout,
  expireTeamRegistrationCheckout,
  markRosterTeamPaymentPaid,
  markTeamRegistrationPaid,
} from './team-payment-mediators';

export type CheckoutMetadata = {
  event_id?: string;
  user_id?: string;
  host_id?: string;
  tip_id?: string;
  registration_id?: string;
  team_id?: string;
  payment_id?: string;
  captain_id?: string;
  sponsor_name?: string;
  sponsor_blurb?: string;
  sponsor_link_url?: string;
  sponsor_logo_url?: string;
  sponsor_discount_code?: string;
  kind?:
    | 'attendee'
    | 'tip'
    | 'team_registration'
    | 'roster_team_payment'
    | 'sponsor_slot'
    | 'badge_slot';
};

/**
 * Customer completed payment. Find the reservation row by checkout_session_id
 * (or by metadata as fallback) and flip it to `paid`. Audit-log the event.
 */
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const meta = (session.metadata ?? {}) as CheckoutMetadata;
  if (!meta.event_id || !meta.kind) return;

  // Defense-in-depth: if `session.customer` is expanded and carries its own
  // user_id metadata, reject when it disagrees with the session metadata.
  // Guards against a misconfigured Stripe Dashboard rule mass-rewriting
  // customer metadata. See docs/audits/security.md P2 #7.
  if (
    meta.user_id &&
    session.customer &&
    typeof session.customer !== 'string' &&
    !session.customer.deleted
  ) {
    const customerUserId = session.customer.metadata?.['user_id'];
    if (customerUserId && customerUserId !== meta.user_id) {
      await log.error('[stripe-webhook] metadata user_id mismatch (session vs customer)', null, {
        sessionId: session.id,
        sessionUserId: meta.user_id,
        customerUserId,
      });
      throw new Error('metadata user_id mismatch');
    }
  }

  const paidAt = new Date().toISOString();
  const piId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  const amountTotal = session.amount_total ?? 0;

  if (meta.kind === 'attendee' && meta.user_id) {
    // The pending payment row was stamped with checkout_session_id at
    // checkout creation; key off it.
    await repositories.eventPaymentRepo.markAttendeePaymentPaidByCheckoutSession(session.id, {
      paymentIntentId: piId,
      amountCents: amountTotal,
      paidAt,
    });

    await repositories.eventPaymentRepo.recordPaymentAudit({
      eventId: meta.event_id,
      userId: meta.user_id,
      action: 'paid',
      amountCents: amountTotal,
      paymentIntentId: piId,
    });

    const hostId = meta.host_id ?? (await lookupHostId(meta.event_id));
    if (hostId) {
      analytics.capture(
        {
          name: 'checkout_completed',
          props: {
            eventId: meta.event_id,
            hostId,
            amountCents: amountTotal,
            kind: 'ticket',
            paymentIntentId: piId ?? '',
          },
        },
        meta.user_id,
      );
    }
  }

  if (meta.kind === 'tip' && meta.tip_id) {
    await repositories.eventPaymentRepo.markTipPaid(meta.tip_id, {
      paymentIntentId: piId,
      paidAt,
    });

    const hostId = meta.host_id ?? (await lookupHostId(meta.event_id));
    if (hostId && meta.user_id) {
      analytics.capture(
        {
          name: 'checkout_completed',
          props: {
            eventId: meta.event_id,
            hostId,
            amountCents: amountTotal,
            kind: 'tip',
            paymentIntentId: piId ?? '',
          },
        },
        meta.user_id,
      );
    }
  }

  if (meta.kind === 'team_registration' && meta.registration_id) {
    if (!piId) {
      log.warn('webhook.team_registration.missing_pi', {
        registrationId: meta.registration_id,
      });
      return;
    }
    await markTeamRegistrationPaid({
      registrationId: meta.registration_id,
      paymentIntentId: piId,
      amountCents: amountTotal,
      paidAt: new Date(paidAt),
    });
    const hostId = meta.host_id ?? (await lookupHostId(meta.event_id));
    if (hostId && meta.captain_id) {
      analytics.capture(
        {
          name: 'checkout_completed',
          props: {
            eventId: meta.event_id,
            hostId,
            amountCents: amountTotal,
            kind: 'team',
            paymentIntentId: piId,
          },
        },
        meta.captain_id,
      );
    }
  }

  if (meta.kind === 'roster_team_payment' && meta.payment_id) {
    if (!piId) {
      log.warn('webhook.roster_team_payment.missing_pi', {
        paymentId: meta.payment_id,
      });
      return;
    }
    await markRosterTeamPaymentPaid({
      paymentId: meta.payment_id,
      paymentIntentId: piId,
      amountCents: amountTotal,
      paidAt: new Date(paidAt),
    });
    const hostId = meta.host_id ?? (await lookupHostId(meta.event_id));
    if (hostId && meta.captain_id) {
      analytics.capture(
        {
          name: 'checkout_completed',
          props: {
            eventId: meta.event_id,
            hostId,
            amountCents: amountTotal,
            kind: 'team',
            paymentIntentId: piId,
          },
        },
        meta.captain_id,
      );
    }
  }

  if (meta.kind === 'sponsor_slot' && meta.user_id) {
    const sponsorName = (meta.sponsor_name ?? '').trim();
    if (!sponsorName) return;

    const sponsorBlurb = (meta.sponsor_blurb ?? '').trim() || null;
    const sponsorLinkUrl = (meta.sponsor_link_url ?? '').trim() || null;
    const sponsorLogoUrl = (meta.sponsor_logo_url ?? '').trim() || null;
    const sponsorDiscountCode = (meta.sponsor_discount_code ?? '').trim() || null;

    await repositories.eventPaymentRepo.upsertSponsorSlot({
      eventId: meta.event_id,
      name: sponsorName,
      blurb: sponsorBlurb,
      linkUrl: sponsorLinkUrl,
      logoUrl: sponsorLogoUrl,
      discountCode: sponsorDiscountCode,
      purchasedByUserId: meta.user_id,
      checkoutSessionId: session.id,
      paymentIntentId: piId,
      paidAt,
    });

    const hostId = meta.host_id ?? (await lookupHostId(meta.event_id));
    if (hostId) {
      analytics.capture(
        {
          name: 'checkout_completed',
          props: {
            eventId: meta.event_id,
            hostId,
            amountCents: amountTotal,
            kind: 'sponsor_slot',
            paymentIntentId: piId ?? '',
          },
        },
        meta.user_id,
      );
    }
  }

  if (meta.kind === 'badge_slot' && meta.user_id) {
    await repositories.eventPaymentRepo.unlockBadgeSlot({
      eventId: meta.event_id,
      purchasedByUserId: meta.user_id,
      checkoutSessionId: session.id,
      paymentIntentId: piId,
      paidAt,
    });

    const hostId = meta.host_id ?? (await lookupHostId(meta.event_id));
    if (hostId) {
      analytics.capture(
        {
          name: 'checkout_completed',
          props: {
            eventId: meta.event_id,
            hostId,
            amountCents: amountTotal,
            kind: 'badge_slot',
            paymentIntentId: piId ?? '',
          },
        },
        meta.user_id,
      );
    }
  }

  // Every kind above mutates state the event-detail page caches under
  // `eventCacheTag` (paid roster row, team registration, sponsor, badge). A
  // webhook runs outside the request that renders that page, so — exactly like
  // every mutating server action (AGENTS.md pattern #1) — it must evict the tag
  // and the page render cache, or a buyer returning from Checkout sees a stale
  // roster until the 60s `unstable_cache` TTL lapses (the Marcus buy e2e caught
  // this — the participant was `paid` in the DB within ~20s but never surfaced
  // in the UI). Guarded so a revalidation hiccup can never fail the webhook and
  // trigger a Stripe retry / duplicate processing.
  try {
    updateTag(eventCacheTag(meta.event_id));
    revalidatePath(`/events/${meta.event_id}`);
  } catch (err) {
    log.warn('[stripe-webhook] event cache revalidate failed', {
      eventId: meta.event_id,
      err: String(err),
    });
  }
}

/**
 * Look up the host_id for an event. Used by webhook capture sites that
 * don't have it in metadata. Returns null silently if the event has been
 * deleted between checkout creation and webhook delivery.
 */
async function lookupHostId(eventId: string): Promise<string | null> {
  return repositories.eventPaymentRepo.findEventHostId(eventId);
}

/**
 * Checkout session expired (30-min default) without a successful payment.
 * Drop the pending reservation so the spot opens back up.
 */
export async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
  const meta = (session.metadata ?? {}) as CheckoutMetadata;
  if (!meta.event_id || !meta.kind) return;

  if (meta.kind === 'attendee' && meta.user_id) {
    // Delete the pending participant; payment row cascades. Look it up
    // by checkout_session_id on the payment side first.
    await repositories.eventPaymentRepo.deletePendingAttendeeByCheckoutSession(session.id);
  }

  if (meta.kind === 'tip' && meta.tip_id) {
    // Drop pending tip rows on expiry; failed payments hit payment_failed
    // separately.
    await repositories.eventPaymentRepo.deletePendingTip(meta.tip_id);
  }

  if (meta.kind === 'team_registration' && meta.registration_id) {
    await expireTeamRegistrationCheckout(meta.registration_id);
  }

  if (meta.kind === 'roster_team_payment' && meta.payment_id) {
    await expireRosterTeamPaymentCheckout(meta.payment_id);
  }

  // The pending reservation just dropped — evict the event-detail cache so the
  // freed spot is reflected (same webhook-side gap as the completed path).
  // Guarded so it can't fail the webhook.
  try {
    updateTag(eventCacheTag(meta.event_id));
    revalidatePath(`/events/${meta.event_id}`);
  } catch (err) {
    log.warn('[stripe-webhook] event cache revalidate failed (expired)', {
      eventId: meta.event_id,
      err: String(err),
    });
  }
}
