/**
 * Stripe-webhook helpers that mark/expire/refund **team** payments through the
 * domain aggregates (architecture audit P3-2 — extracted verbatim from the
 * webhook route). Two parallel sets:
 *
 * - Team registration (ADR 0007) — the ad-hoc / walk-in `EventTeamRegistration`
 *   aggregate.
 * - Roster-mode per-team payment (ADR 0007, Bundle 4) — the `EventTeamPayment`
 *   sidecar to a persistent `event_teams` registration.
 *
 * Both go through the aggregate so the payment state machine + idempotency stay
 * in one place. Shared by the checkout-completed/expired and charge-refunded
 * handlers.
 */
import {
  InvariantViolation,
  RegistrationPaymentStatus,
  EventTeamPaymentId,
  EventTeamRegistrationId,
} from '@pickupvb/domain';
import { repositories } from '@/lib/handlers';
import { log } from '@/lib/log';

// ----------------------------------------------------------------------------
// Team registration helpers (ADR 0007). Mediated through the aggregate so
// invariants (state machine, idempotency) stay in one place.
// ----------------------------------------------------------------------------

export async function markTeamRegistrationPaid(args: {
  registrationId: string;
  paymentIntentId: string;
  amountCents: number;
  paidAt: Date;
}): Promise<void> {
  const { eventTeamRegistrationRepo } = repositories;
  const reg = await eventTeamRegistrationRepo.findById(
    EventTeamRegistrationId(args.registrationId),
  );
  if (!reg) {
    log.warn('webhook.team_registration.missing', { registrationId: args.registrationId });
    return;
  }
  if (reg.paymentStatus === RegistrationPaymentStatus.Paid) return;
  try {
    reg.markPaid({
      paymentIntentId: args.paymentIntentId,
      amountCents: args.amountCents,
      paidAt: args.paidAt,
    });
    await eventTeamRegistrationRepo.save(reg);
  } catch (err) {
    // Refunded → Paid would violate the invariant; treat as idempotent.
    if (err instanceof InvariantViolation) return;
    throw err;
  }
  // Ledger entry so the entry fee shows on the captain's receipts and the
  // host's earnings (receipts-tax R-1). The early `=== Paid` guard above makes
  // this run once per registration even on a webhook retry. `captainId` is null
  // for an account-less captain.
  await repositories.eventPaymentRepo.recordPaymentAudit({
    eventId: reg.eventId,
    userId: reg.captainId,
    action: 'paid',
    amountCents: args.amountCents,
    paymentIntentId: args.paymentIntentId,
    category: 'team',
  });
}

export async function expireTeamRegistrationCheckout(registrationId: string): Promise<void> {
  const { eventTeamRegistrationRepo } = repositories;
  const reg = await eventTeamRegistrationRepo.findById(EventTeamRegistrationId(registrationId));
  if (!reg) return;
  reg.expireCheckout(); // no-op unless Pending
  await eventTeamRegistrationRepo.save(reg);
}

export async function refundTeamRegistrationIfAny(
  paymentIntentId: string,
  amountRefundedCents: number | null,
): Promise<void> {
  const { eventTeamRegistrationRepo } = repositories;
  const reg = await eventTeamRegistrationRepo.findByPaymentIntentId(paymentIntentId);
  if (!reg) return;
  if (reg.paymentStatus !== RegistrationPaymentStatus.Paid) return;
  // Capture the paid amount before the state transition, in case markRefunded
  // ever clears it.
  const paidCents = reg.amountPaidCents ?? 0;
  reg.markRefunded();
  await eventTeamRegistrationRepo.save(reg);
  // Matching `refunded` ledger row so the entry nets out (receipts-tax R-1).
  // The `!== Paid` guard above makes this run once even on a webhook retry.
  await repositories.eventPaymentRepo.recordPaymentAudit({
    eventId: reg.eventId,
    userId: reg.captainId,
    action: 'refunded',
    amountCents: amountRefundedCents ?? paidCents,
    paymentIntentId,
    category: 'team',
  });
}

// ----------------------------------------------------------------------------
// Roster-mode per-team payment helpers (ADR 0007 — Bundle 4). Sidecar to
// the persistent team registration in `event_teams`; mediated through the
// {@link EventTeamPayment} aggregate.
// ----------------------------------------------------------------------------

export async function markRosterTeamPaymentPaid(args: {
  paymentId: string;
  paymentIntentId: string;
  amountCents: number;
  paidAt: Date;
}): Promise<void> {
  const { eventTeamPaymentRepo } = repositories;
  const payment = await eventTeamPaymentRepo.findById(EventTeamPaymentId(args.paymentId));
  if (!payment) {
    log.warn('webhook.roster_team_payment.missing', { paymentId: args.paymentId });
    return;
  }
  if (payment.paymentStatus === RegistrationPaymentStatus.Paid) return;
  try {
    payment.markPaid({
      paymentIntentId: args.paymentIntentId,
      amountCents: args.amountCents,
      paidAt: args.paidAt,
    });
    await eventTeamPaymentRepo.save(payment);
  } catch (err) {
    if (err instanceof InvariantViolation) return;
    throw err;
  }
  // Ledger entry for receipts/earnings (receipts-tax R-1); runs once per
  // payment thanks to the `=== Paid` guard above.
  await repositories.eventPaymentRepo.recordPaymentAudit({
    eventId: payment.eventId,
    userId: payment.captainId,
    action: 'paid',
    amountCents: args.amountCents,
    paymentIntentId: args.paymentIntentId,
    category: 'team',
  });
}

export async function expireRosterTeamPaymentCheckout(paymentId: string): Promise<void> {
  const { eventTeamPaymentRepo } = repositories;
  const payment = await eventTeamPaymentRepo.findById(EventTeamPaymentId(paymentId));
  if (!payment) return;
  payment.expireCheckout();
  await eventTeamPaymentRepo.save(payment);
}

export async function refundRosterTeamPaymentIfAny(
  paymentIntentId: string,
  amountRefundedCents: number | null,
): Promise<void> {
  const { eventTeamPaymentRepo } = repositories;
  const payment = await eventTeamPaymentRepo.findByPaymentIntentId(paymentIntentId);
  if (!payment) return;
  if (payment.paymentStatus !== RegistrationPaymentStatus.Paid) return;
  const paidCents = payment.amountPaidCents ?? 0;
  payment.markRefunded();
  await eventTeamPaymentRepo.save(payment);
  // Matching `refunded` ledger row so the entry nets out (receipts-tax R-1).
  await repositories.eventPaymentRepo.recordPaymentAudit({
    eventId: payment.eventId,
    userId: payment.captainId,
    action: 'refunded',
    amountCents: amountRefundedCents ?? paidCents,
    paymentIntentId,
    category: 'team',
  });
}
