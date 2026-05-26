import type { EventTeamRegistration, EventTeamRegistrationId } from './event-team-registration.js';

/**
 * Repository port for the {@link EventTeamRegistration} aggregate
 * (ad-hoc team registrations introduced by ADR 0007).
 *
 * Read-side queries that list registrations alongside profile data live on
 * {@link EventRepository.getDetail} as denormalized read models; this port
 * is strictly the write-side aggregate door.
 */
export interface EventTeamRegistrationRepository {
  findById(id: EventTeamRegistrationId): Promise<EventTeamRegistration | null>;
  /** Lookup by Stripe Checkout session id for webhook handlers. */
  findByCheckoutSessionId(sessionId: string): Promise<EventTeamRegistration | null>;
  /** Lookup by Stripe PaymentIntent id (set on markPaid) for refund webhooks. */
  findByPaymentIntentId(paymentIntentId: string): Promise<EventTeamRegistration | null>;
  /**
   * True when {@link captainId} already has a registration on this event in
   * the given division. Used at register-time to enforce the "one team per
   * division per captain" rule (ADR 0007).
   */
  existsForCaptainInDivision(
    eventId: string,
    captainId: string,
    divisionId: string,
  ): Promise<boolean>;
  save(registration: EventTeamRegistration): Promise<void>;
  /**
   * Hard-removes the registration and cascades its roster members. Use only
   * when the registration never touched Stripe (payment_status = none) —
   * after a successful checkout, prefer {@link softDelete} so the row stays
   * queryable for refund reconciliation.
   */
  delete(id: EventTeamRegistrationId): Promise<void>;
  /**
   * Marks the registration as deleted (sets `deleted_at = now()`) without
   * removing the row. Used after Stripe checkout so the audit trail of a
   * paid + refunded registration survives even after the host withdraws
   * the team from the event. Roster members stay attached.
   */
  softDelete(id: EventTeamRegistrationId): Promise<void>;
}
