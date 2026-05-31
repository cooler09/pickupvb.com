import { idConstructor, type Brand } from '../shared/brand.js';
import { AggregateRoot } from '../shared/aggregate-root.js';
import { InvariantViolation } from '../shared/result.js';
import {
  RegistrationPaymentStatus,
  type RegistrationPaymentStatus as PaymentStatus,
} from './event-team-registration.js';
import type { UserId } from './volleyball-event.js';

export type EventTeamPaymentId = Brand<string, 'EventTeamPaymentId'>;
export const EventTeamPaymentId = idConstructor<'EventTeamPaymentId'>();

/**
 * Captain-checkout payment for a roster-mode tournament team (ADR 0007).
 *
 * Persistent teams register through `event_teams` (the original
 * registration row). This sidecar aggregate tracks the per-team Stripe
 * payment when the chosen division is priced `per_team` on an on-platform
 * event. It is **only** created when a captain initiates checkout — the
 * absence of a row implies "no payment owed yet" (free division,
 * off-platform event, or per_player pricing).
 *
 * State machine matches {@link EventTeamRegistration}'s payment
 * transitions verbatim so the webhook handlers can stay symmetric:
 * `None → Pending → Paid` (terminal except `Paid → Refunded`).
 *
 * @see EventTeamRegistration (ad-hoc sibling that owns its own roster).
 * @see docs/journal/2026-05-22-bundle-3.md Decision 3 — sidecar rationale.
 */
export class EventTeamPayment extends AggregateRoot<EventTeamPaymentId> {
  private constructor(
    id: EventTeamPaymentId,
    public readonly eventId: string,
    public readonly teamId: string,
    public readonly captainId: UserId,
    private _paymentStatus: PaymentStatus,
    private _checkoutSessionId: string | null,
    private _paymentIntentId: string | null,
    private _amountPaidCents: number | null,
    private _paidAt: Date | null,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {
    super(id);
  }

  /**
   * Produce a fresh `EventTeamPayment` in `None` status — no checkout has
   * been started yet. Pure constructor; no validation beyond what the
   * caller-supplied IDs already enforce.
   */
  static create(props: {
    id: EventTeamPaymentId;
    eventId: string;
    teamId: string;
    captainId: UserId;
  }): EventTeamPayment {
    const now = new Date();
    return new EventTeamPayment(
      props.id,
      props.eventId,
      props.teamId,
      props.captainId,
      RegistrationPaymentStatus.None,
      null,
      null,
      null,
      null,
      now,
      now,
    );
  }

  /**
   * Rebuild an `EventTeamPayment` from already-persisted state. Skips the
   * payment-state-machine guards that the mutation methods enforce — only
   * call from repository adapters.
   */
  static rehydrate(props: {
    id: EventTeamPaymentId;
    eventId: string;
    teamId: string;
    captainId: UserId;
    paymentStatus: PaymentStatus;
    checkoutSessionId: string | null;
    paymentIntentId: string | null;
    amountPaidCents: number | null;
    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): EventTeamPayment {
    return new EventTeamPayment(
      props.id,
      props.eventId,
      props.teamId,
      props.captainId,
      props.paymentStatus,
      props.checkoutSessionId,
      props.paymentIntentId,
      props.amountPaidCents,
      props.paidAt,
      props.createdAt,
      props.updatedAt,
    );
  }

  get paymentStatus(): PaymentStatus {
    return this._paymentStatus;
  }
  get checkoutSessionId(): string | null {
    return this._checkoutSessionId;
  }
  get paymentIntentId(): string | null {
    return this._paymentIntentId;
  }
  get amountPaidCents(): number | null {
    return this._amountPaidCents;
  }
  get paidAt(): Date | null {
    return this._paidAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  /** Captain has been redirected to Stripe Checkout for the per-team total. */
  markCheckoutPending(checkoutSessionId: string): void {
    if (this._paymentStatus !== RegistrationPaymentStatus.None) {
      throw new InvariantViolation(
        `Cannot start checkout from payment status "${this._paymentStatus}".`,
      );
    }
    this._paymentStatus = RegistrationPaymentStatus.Pending;
    this._checkoutSessionId = checkoutSessionId;
    this._updatedAt = new Date();
  }

  /**
   * Stripe Checkout Session expired or the captain bailed out without
   * paying. Reset to None so they can retry without an explicit withdraw.
   * No-op unless Pending — the webhook may race the captain's manual retry.
   */
  expireCheckout(): void {
    if (this._paymentStatus !== RegistrationPaymentStatus.Pending) return;
    this._paymentStatus = RegistrationPaymentStatus.None;
    this._checkoutSessionId = null;
    this._updatedAt = new Date();
  }

  /** Webhook confirms the captain's checkout session was paid. */
  markPaid(props: { paymentIntentId: string; amountCents: number; paidAt: Date }): void {
    if (
      this._paymentStatus !== RegistrationPaymentStatus.Pending &&
      this._paymentStatus !== RegistrationPaymentStatus.None
    ) {
      throw new InvariantViolation(
        `Cannot mark paid from payment status "${this._paymentStatus}".`,
      );
    }
    if (!Number.isInteger(props.amountCents) || props.amountCents < 0) {
      throw new InvariantViolation('Paid amount must be a non-negative integer of cents.');
    }
    this._paymentStatus = RegistrationPaymentStatus.Paid;
    this._paymentIntentId = props.paymentIntentId;
    this._amountPaidCents = props.amountCents;
    this._paidAt = props.paidAt;
    this._updatedAt = new Date();
  }

  /** Host refund or captain cancellation after payment. */
  markRefunded(): void {
    if (this._paymentStatus !== RegistrationPaymentStatus.Paid) {
      throw new InvariantViolation(`Cannot refund from payment status "${this._paymentStatus}".`);
    }
    this._paymentStatus = RegistrationPaymentStatus.Refunded;
    this._updatedAt = new Date();
  }
}
