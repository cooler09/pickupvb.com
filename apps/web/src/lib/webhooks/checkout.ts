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
import { getAdminSupabase } from '@/lib/supabase-admin';
import { computePassExpiresAt } from '@/lib/pass-helpers';
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
  /** Season passes (ADR 0037). A pass purchase is host-level — it has no event_id. */
  purchase_id?: string;
  pass_id?: string;
  kind?:
    | 'attendee'
    | 'tip'
    | 'team_registration'
    | 'roster_team_payment'
    | 'sponsor_slot'
    | 'badge_slot'
    | 'pass_purchase';
};

/**
 * Customer completed payment. Find the reservation row by checkout_session_id
 * (or by metadata as fallback) and flip it to `paid`. Audit-log the event.
 */
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const meta = (session.metadata ?? {}) as CheckoutMetadata;

  // Season-pass purchases (ADR 0037) are host-level, so they carry no event_id —
  // handle them before the event_id guard below.
  if (meta.kind === 'pass_purchase') {
    await handlePassPurchaseCompleted(session, meta);
    return;
  }

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
      category: 'ticket',
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

    // Ledger entry so the tip shows on the tipper's receipts and the host's
    // earnings (receipts-tax R-1). `user_id` is null for an anon tipper.
    await repositories.eventPaymentRepo.recordPaymentAudit({
      eventId: meta.event_id,
      userId: meta.user_id ?? null,
      action: 'paid',
      amountCents: amountTotal,
      paymentIntentId: piId,
      category: 'tip',
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

  // Sponsor + badge unlocks are PLATFORM-DIRECT charges (PickupVB's own account,
  // no Connect destination — see docs/payments.md § Platform-direct charges).
  // They deliberately do NOT write an `event_payment_audit` ledger row: the host
  // is the *buyer* here, not the payee, so this revenue is platform income, not
  // host payout income, and is intentionally excluded from the host-earnings /
  // receipts surfaces. The `sponsor_slot` / `badge_slot` category values are
  // reserved in the enum + CHECK for forward-compat only — see
  // 20260926000000_payment_audit_category.sql. The buyer's receipt is Stripe's
  // emailed receipt from the platform account. (monetization audit M-3b.)
  if (meta.kind === 'sponsor_slot' && meta.user_id) {
    const sponsorName = (meta.sponsor_name ?? '').trim();
    if (!sponsorName) return;

    const sponsorBlurb = (meta.sponsor_blurb ?? '').trim() || null;
    const sponsorLinkUrl = (meta.sponsor_link_url ?? '').trim() || null;
    const sponsorLogoUrl = (meta.sponsor_logo_url ?? '').trim() || null;
    const sponsorDiscountCode = (meta.sponsor_discount_code ?? '').trim() || null;

    // Entitlement and content are decoupled (monetization audit SP-1): record
    // the paid unlock in `event_sponsor_access` FIRST so removing the sponsor
    // later never destroys the entitlement, then materialize the content. Both
    // upsert on event_id, so a redelivered webhook is idempotent.
    await repositories.eventPaymentRepo.unlockSponsorSlot({
      eventId: meta.event_id,
      purchasedByUserId: meta.user_id,
      checkoutSessionId: session.id,
      paymentIntentId: piId,
      paidAt,
    });

    await repositories.eventPaymentRepo.upsertSponsorSlot({
      eventId: meta.event_id,
      name: sponsorName,
      blurb: sponsorBlurb,
      linkUrl: sponsorLinkUrl,
      logoUrl: sponsorLogoUrl,
      discountCode: sponsorDiscountCode,
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
 * Season-pass purchase completed (ADR 0037). Flip the pending `pass_purchases`
 * row to paid and stamp `expires_at` — re-deriving credits + expiry from the
 * authoritative `host_passes` row so a tampered pending row can't grant extra
 * credits. Admin client: `pass_purchases` writes are admin-only. Idempotent —
 * the update only touches a still-`pending` row, so a redelivered webhook is a
 * no-op. No event-cache eviction (a pass isn't event-scoped); the buyer's
 * pass balance is a per-viewer read.
 */
async function handlePassPurchaseCompleted(
  session: Stripe.Checkout.Session,
  meta: CheckoutMetadata,
): Promise<void> {
  const purchaseId = meta.purchase_id;
  if (!purchaseId) return;

  const admin = getAdminSupabase();
  const paidAt = new Date().toISOString();
  const piId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  const amountTotal = session.amount_total ?? 0;

  // Re-derive credits + expiry from the pass (authoritative).
  const { data: purchaseRow } = await admin
    .from('pass_purchases')
    .select('pass_id')
    .eq('id', purchaseId)
    .maybeSingle();
  const passId = (purchaseRow as { pass_id: string } | null)?.pass_id ?? meta.pass_id ?? null;

  let creditsTotal: number | null = null;
  let expiresAt: string | null = null;
  if (passId) {
    const { data: passRow } = await admin
      .from('host_passes')
      .select('credit_count, expires_in_days')
      .eq('id', passId)
      .maybeSingle();
    const p = passRow as { credit_count: number; expires_in_days: number | null } | null;
    if (p) {
      creditsTotal = p.credit_count;
      expiresAt = computePassExpiresAt(paidAt, p.expires_in_days);
    }
  }

  await admin
    .from('pass_purchases')
    .update({
      payment_status: 'paid',
      payment_intent_id: piId,
      amount_paid_cents: amountTotal,
      paid_at: paidAt,
      expires_at: expiresAt,
      ...(creditsTotal != null ? { credits_total: creditsTotal } : {}),
    })
    .eq('id', purchaseId)
    .eq('payment_status', 'pending');

  if (meta.host_id) {
    analytics.capture(
      {
        name: 'checkout_completed',
        props: {
          eventId: '',
          hostId: meta.host_id,
          amountCents: amountTotal,
          kind: 'pass_purchase',
          paymentIntentId: piId ?? '',
        },
      },
      meta.user_id ?? meta.host_id,
    );
  }
}

/**
 * Checkout session expired (30-min default) without a successful payment.
 * Drop the pending reservation so the spot opens back up.
 */
export async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
  const meta = (session.metadata ?? {}) as CheckoutMetadata;

  // Pass purchases carry no event_id — drop the abandoned pending purchase so a
  // stale row doesn't linger. Only deletes a still-pending row (idempotent).
  if (meta.kind === 'pass_purchase') {
    if (meta.purchase_id) {
      await getAdminSupabase()
        .from('pass_purchases')
        .delete()
        .eq('id', meta.purchase_id)
        .eq('payment_status', 'pending');
    }
    return;
  }

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
