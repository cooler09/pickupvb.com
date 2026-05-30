/**
 * `checkout.session.*` webhook handlers (architecture audit P3-2 — extracted
 * verbatim from the webhook route). `completed` flips the matching reservation
 * row to paid + audit-logs + fires analytics; `expired` drops the pending
 * reservation so the spot re-opens. Both key off `session.metadata.kind`.
 */
import type Stripe from 'stripe';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { analytics } from '@/lib/handlers';
import { log } from '@/lib/log';
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
  kind?: 'attendee' | 'tip' | 'team_registration' | 'roster_team_payment' | 'sponsor_slot';
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

  const admin = getAdminSupabase();
  const paidAt = new Date().toISOString();
  const piId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  const amountTotal = session.amount_total ?? 0;

  if (meta.kind === 'attendee' && meta.user_id) {
    // The pending payment row was stamped with checkout_session_id at
    // checkout creation; key off it.
    const { error } = await admin
      .from('event_participant_payments')
      .update({
        payment_status: 'paid',
        payment_intent_id: piId,
        amount_paid_cents: amountTotal,
        paid_at: paidAt,
      } as never)
      .eq('checkout_session_id', session.id);
    if (error) throw new Error(`mark attendee paid failed: ${error.message}`);

    await admin.from('event_payment_audit').insert({
      event_id: meta.event_id,
      user_id: meta.user_id,
      action: 'paid',
      amount_cents: amountTotal,
      payment_intent_id: piId,
    } as never);

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
    const { error } = await admin
      .from('event_tips')
      .update({
        status: 'paid',
        stripe_payment_intent_id: piId,
        paid_at: paidAt,
      } as never)
      .eq('id', meta.tip_id);
    if (error) throw new Error(`mark tip paid failed: ${error.message}`);

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

    const { error } = await admin.from('event_sponsors').upsert(
      {
        event_id: meta.event_id,
        name: sponsorName,
        blurb: sponsorBlurb,
        link_url: sponsorLinkUrl,
        logo_url: sponsorLogoUrl,
        discount_code: sponsorDiscountCode,
        access_kind: 'ala_carte',
        purchased_by_user_id: meta.user_id,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: piId,
        paid_at: paidAt,
      } as never,
      { onConflict: 'event_id' },
    );
    if (error) throw new Error(`mark sponsor slot paid failed: ${error.message}`);

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
}

/**
 * Look up the host_id for an event. Used by webhook capture sites that
 * don't have it in metadata. Returns null silently if the event has been
 * deleted between checkout creation and webhook delivery.
 */
async function lookupHostId(eventId: string): Promise<string | null> {
  const admin = getAdminSupabase();
  const { data } = await admin.from('events').select('host_id').eq('id', eventId).maybeSingle();
  return (data as { host_id: string } | null)?.host_id ?? null;
}

/**
 * Checkout session expired (30-min default) without a successful payment.
 * Drop the pending reservation so the spot opens back up.
 */
export async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
  const meta = (session.metadata ?? {}) as CheckoutMetadata;
  if (!meta.event_id || !meta.kind) return;
  const admin = getAdminSupabase();

  if (meta.kind === 'attendee' && meta.user_id) {
    // Delete the pending participant; payment row cascades. Look it up
    // by checkout_session_id on the payment side first.
    const { data: payRow } = await admin
      .from('event_participant_payments')
      .select('participant_id')
      .eq('checkout_session_id', session.id)
      .eq('payment_status', 'pending')
      .maybeSingle();
    const pid = (payRow as { participant_id: string } | null)?.participant_id;
    if (pid) {
      await admin.from('event_participants').delete().eq('id', pid);
    }
  }

  if (meta.kind === 'tip' && meta.tip_id) {
    // Drop pending tip rows on expiry; failed payments hit payment_failed
    // separately.
    await admin.from('event_tips').delete().eq('id', meta.tip_id).eq('status', 'pending');
  }

  if (meta.kind === 'team_registration' && meta.registration_id) {
    await expireTeamRegistrationCheckout(meta.registration_id);
  }

  if (meta.kind === 'roster_team_payment' && meta.payment_id) {
    await expireRosterTeamPaymentCheckout(meta.payment_id);
  }
}
