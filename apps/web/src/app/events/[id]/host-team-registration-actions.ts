'use server';

/**
 * Host-only server actions for ad-hoc team registrations (ADR 0007).
 *
 * Auth: each action validates `event.canManage` via the event detail
 * read model before touching the aggregate. Operations go through
 * `EventTeamRegistration` domain methods so invariants stay enforced.
 *
 * Bound from the JSX as:
 *   <form action={hostMarkTeamRegistrationPaid.bind(null, eventId, registrationId, returnPath)}>
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath, updateTag } from 'next/cache';
import { eventCacheTag } from '@/lib/cache-tags';
import { GetEventDetailQuery } from '@pickupvb/application';
import {
  InvariantViolation,
  RegistrationPaymentStatus,
  EventTeamRegistrationId,
  UserId,
} from '@pickupvb/domain';
import { handlers, repositories } from '@/lib/handlers';
import { field } from '@/lib/form-data';
import { getViewer } from '@/lib/server-auth';
import { redirectEventNotice } from '@/lib/server-redirects';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { log } from '@/lib/log';

async function authorizeHost(
  eventId: string,
): Promise<{ ok: true; viewerId: string } | { ok: false }> {
  const viewer = await getViewer();
  if (!viewer || viewer.isAnonymous) return { ok: false };
  const detail = await handlers.getEventDetail.execute(
    new GetEventDetailQuery(eventId, viewer.user.id),
  );
  if (!detail.canManage) return { ok: false };
  return { ok: true, viewerId: viewer.user.id };
}

/**
 * Mark a team registration as paid out-of-band (cash / Venmo / etc.).
 * Refuses to touch Stripe-paid rows — those are already paid. The
 * synthetic `paymentIntentId` (`offline:host:<uuid>`) acts as a sentinel
 * so the webhook refund path never matches.
 */
export async function hostMarkTeamRegistrationPaid(
  eventId: string,
  registrationId: string,
  returnPath: string,
): Promise<void> {
  const auth = await authorizeHost(eventId);
  if (!auth.ok) {
    redirectEventNotice(eventId, 'rsvp', 'team_forbidden');
  }

  const { eventTeamRegistrationRepo } = repositories;
  const reg = await eventTeamRegistrationRepo.findById(EventTeamRegistrationId(registrationId));
  if (!reg) redirectEventNotice(eventId, 'rsvp', 'event_not_found');
  if (reg.paymentStatus === RegistrationPaymentStatus.Paid) {
    redirectEventNotice(eventId, 'rsvp', 'already');
  }
  if (reg.paymentStatus === RegistrationPaymentStatus.Refunded) {
    redirectEventNotice(eventId, 'rsvp', 'refunded');
  }

  // Look up the per-team price for this division to record the amount.
  // We re-use the event detail we already loaded for auth (cheaper than
  // re-fetching).
  const detail = await handlers.getEventDetail.execute(
    new GetEventDetailQuery(eventId, auth.viewerId),
  );
  const division = detail.divisions.find((d) => d.id === String(reg.divisionId));
  const amountCents = division?.priceCents ?? 0;

  try {
    reg.markPaid({
      paymentIntentId: `offline:host:${randomUUID()}`,
      amountCents,
      paidAt: new Date(),
    });
    await eventTeamRegistrationRepo.save(reg);
  } catch (err) {
    if (err instanceof InvariantViolation) {
      redirectEventNotice(eventId, 'rsvp', 'error', err.message);
    }
    throw err;
  }

  revalidatePath(returnPath);
  redirectEventNotice(eventId, 'rsvp', 'team_marked_paid');
}

/**
 * Refund a paid team registration. If it was paid through Stripe, issue
 * the Stripe refund; otherwise (off-platform paid) just flip the state.
 * Either way the aggregate moves to Refunded.
 */
export async function hostRefundTeamRegistration(
  eventId: string,
  registrationId: string,
  returnPath: string,
): Promise<void> {
  const auth = await authorizeHost(eventId);
  if (!auth.ok) {
    redirectEventNotice(eventId, 'rsvp', 'team_forbidden');
  }

  const { eventTeamRegistrationRepo } = repositories;
  const reg = await eventTeamRegistrationRepo.findById(EventTeamRegistrationId(registrationId));
  if (!reg) redirectEventNotice(eventId, 'rsvp', 'event_not_found');
  if (reg.paymentStatus !== RegistrationPaymentStatus.Paid) {
    redirectEventNotice(eventId, 'rsvp', 'team_not_paid');
  }

  const piId = reg.paymentIntentId;
  const isStripePayment = !!piId && !piId.startsWith('offline:');

  if (isStripePayment && isStripeConfigured()) {
    try {
      const stripe = getStripe();
      await stripe.refunds.create(
        {
          payment_intent: piId!,
          reason: 'requested_by_customer',
          refund_application_fee: true,
          reverse_transfer: true,
        },
        { idempotencyKey: `host-refund:team:${registrationId}` },
      );
    } catch (err) {
      await log.error('[host-refund] team registration refund failed', err, {
        eventId,
        registrationId,
      });
      redirectEventNotice(eventId, 'rsvp', 'team_refund_failed');
    }
    // The charge.refunded webhook will call markRefunded() idempotently.
    // We still flip locally so the next render reflects the refund.
  }

  try {
    reg.markRefunded();
    await eventTeamRegistrationRepo.save(reg);
  } catch (err) {
    if (err instanceof InvariantViolation) {
      // Already refunded — fine.
    } else {
      throw err;
    }
  }

  revalidatePath(returnPath);
  redirectEventNotice(
    eventId,
    'rsvp',
    isStripePayment ? 'team_refund_sent' : 'team_refund_offline',
  );
}

/**
 * Withdraw a team registration from the event. Only allowed when
 * payment_status is None or Refunded — refund through Stripe first if
 * the team has paid. The delete strategy depends on whether the row
 * ever touched Stripe:
 *
 *   - `None` — no checkout was ever attempted; hard-delete is safe and
 *     keeps the table clean.
 *   - `Refunded` — the captain paid through Stripe and the host issued
 *     a Connect refund. Soft-delete (set `deleted_at`) so the row stays
 *     queryable for refund reconciliation and dispute response, but
 *     disappears from product surfaces immediately. The eventual
 *     account-deletion purge will hard-delete it.
 *
 * See migration 20260629000000 and audit P2 #5 in
 * docs/audits/data-lifecycle.md.
 */
export async function hostForceWithdrawTeamRegistration(
  eventId: string,
  registrationId: string,
  returnPath: string,
): Promise<void> {
  const auth = await authorizeHost(eventId);
  if (!auth.ok) {
    redirectEventNotice(eventId, 'rsvp', 'team_forbidden');
  }

  const { eventTeamRegistrationRepo } = repositories;
  const reg = await eventTeamRegistrationRepo.findById(EventTeamRegistrationId(registrationId));
  if (!reg) redirectEventNotice(eventId, 'rsvp', 'event_not_found');

  if (
    reg.paymentStatus !== RegistrationPaymentStatus.None &&
    reg.paymentStatus !== RegistrationPaymentStatus.Refunded
  ) {
    redirectEventNotice(eventId, 'rsvp', 'team_force_blocked');
  }

  if (reg.paymentStatus === RegistrationPaymentStatus.None) {
    await eventTeamRegistrationRepo.delete(reg.id);
  } else {
    await eventTeamRegistrationRepo.softDelete(reg.id);
  }

  revalidatePath(returnPath);
  updateTag(eventCacheTag(eventId));
  redirectEventNotice(eventId, 'rsvp', 'team_force_withdrawn');
}

/**
 * Link a host-added (`walk_in`) team to a real captain's account (ADR 0033
 * Phase 3 / ADR 0017 §7). The host picks a registered user via the
 * `UserPicker`; the entry stops being a placeholder (`captain_id` set, source
 * → `ad_hoc`, freeform walk-in identity cleared) so the captain can manage the
 * roster, pay, and self-report league scores. Co-host aware — gated on
 * `canManage`, then run on the aggregate via the admin-client repo.
 */
export async function assignTeamCaptainFromForm(
  eventId: string,
  registrationId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const auth = await authorizeHost(eventId);
  if (!auth.ok) {
    redirectEventNotice(eventId, 'rsvp', 'team_forbidden');
  }
  const captainUserId = field(formData, 'captain_user_id');
  if (!captainUserId) {
    redirectEventNotice(eventId, 'rsvp', 'error', 'Pick a player to assign as captain.');
  }

  const { eventTeamRegistrationRepo } = repositories;
  const reg = await eventTeamRegistrationRepo.findById(EventTeamRegistrationId(registrationId));
  if (!reg) redirectEventNotice(eventId, 'rsvp', 'event_not_found');

  // One team per captain per division — don't let the assignee end up
  // captaining two teams in the same division.
  const dup = await eventTeamRegistrationRepo.existsForCaptainInDivision(
    reg.eventId,
    captainUserId,
    String(reg.divisionId),
  );
  if (dup) redirectEventNotice(eventId, 'rsvp', 'captain_dup');

  try {
    reg.assignCaptain(UserId(captainUserId));
    await eventTeamRegistrationRepo.save(reg);
  } catch (err) {
    if (err instanceof InvariantViolation) {
      redirectEventNotice(eventId, 'rsvp', 'error', err.message);
    }
    throw err;
  }

  revalidatePath(returnPath);
  updateTag(eventCacheTag(eventId));
  redirectEventNotice(eventId, 'rsvp', 'captain_assigned');
}
