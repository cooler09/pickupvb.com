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
  type EventTeamPaymentId,
  type EventTeamRegistrationId,
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
    args.registrationId as never as EventTeamRegistrationId,
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
}

export async function expireTeamRegistrationCheckout(registrationId: string): Promise<void> {
  const { eventTeamRegistrationRepo } = repositories;
  const reg = await eventTeamRegistrationRepo.findById(
    registrationId as never as EventTeamRegistrationId,
  );
  if (!reg) return;
  reg.expireCheckout(); // no-op unless Pending
  await eventTeamRegistrationRepo.save(reg);
}

export async function refundTeamRegistrationIfAny(
  paymentIntentId: string,
  _amountRefundedCents: number | null,
): Promise<void> {
  const { eventTeamRegistrationRepo } = repositories;
  const reg = await eventTeamRegistrationRepo.findByPaymentIntentId(paymentIntentId);
  if (!reg) return;
  if (reg.paymentStatus !== RegistrationPaymentStatus.Paid) return;
  reg.markRefunded();
  await eventTeamRegistrationRepo.save(reg);
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
  const payment = await eventTeamPaymentRepo.findById(
    args.paymentId as never as EventTeamPaymentId,
  );
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
}

export async function expireRosterTeamPaymentCheckout(paymentId: string): Promise<void> {
  const { eventTeamPaymentRepo } = repositories;
  const payment = await eventTeamPaymentRepo.findById(paymentId as never as EventTeamPaymentId);
  if (!payment) return;
  payment.expireCheckout();
  await eventTeamPaymentRepo.save(payment);
}

export async function refundRosterTeamPaymentIfAny(
  paymentIntentId: string,
  _amountRefundedCents: number | null,
): Promise<void> {
  const { eventTeamPaymentRepo } = repositories;
  const payment = await eventTeamPaymentRepo.findByPaymentIntentId(paymentIntentId);
  if (!payment) return;
  if (payment.paymentStatus !== RegistrationPaymentStatus.Paid) return;
  payment.markRefunded();
  await eventTeamPaymentRepo.save(payment);
}
