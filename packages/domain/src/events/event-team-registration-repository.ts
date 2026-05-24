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
  /** Removes the registration and cascades its roster members. */
  delete(id: EventTeamRegistrationId): Promise<void>;
}
