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
import { revalidatePath } from 'next/cache';
import { GetEventDetailQuery } from '@pickupvb/application';
import {
  InvariantViolation,
  RegistrationPaymentStatus,
  type EventTeamRegistrationId,
} from '@pickupvb/domain';
import { handlers, repositories } from '@/lib/handlers';
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
  const reg = await eventTeamRegistrationRepo.findById(
    registrationId as never as EventTeamRegistrationId,
  );
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
  const reg = await eventTeamRegistrationRepo.findById(
    registrationId as never as EventTeamRegistrationId,
  );
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
 * Delete a team registration outright. Only allowed when payment_status
 * is None or Refunded — refund through Stripe first if the team has paid.
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
  const reg = await eventTeamRegistrationRepo.findById(
    registrationId as never as EventTeamRegistrationId,
  );
  if (!reg) redirectEventNotice(eventId, 'rsvp', 'event_not_found');

  if (
    reg.paymentStatus !== RegistrationPaymentStatus.None &&
    reg.paymentStatus !== RegistrationPaymentStatus.Refunded
  ) {
    redirectEventNotice(eventId, 'rsvp', 'team_force_blocked');
  }

  await eventTeamRegistrationRepo.delete(reg.id);

  revalidatePath(returnPath);
  redirectEventNotice(eventId, 'rsvp', 'team_force_withdrawn');
}
