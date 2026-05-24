import type { EventTeamPayment, EventTeamPaymentId } from './event-team-payment.js';

/**
 * Repository port for {@link EventTeamPayment} (roster-mode per-team
 * captain checkout — ADR 0007). The adapter lives in `@pickupvb/infrastructure`.
 *
 * Lookup affordances mirror {@link EventTeamRegistrationRepository} so
 * webhook handlers can find the aggregate by checkout session id or
 * payment intent id without re-deriving event/team context.
 */
export interface EventTeamPaymentRepository {
  findById(id: EventTeamPaymentId): Promise<EventTeamPayment | null>;
  findByEventAndTeam(eventId: string, teamId: string): Promise<EventTeamPayment | null>;
  findByCheckoutSessionId(sessionId: string): Promise<EventTeamPayment | null>;
  findByPaymentIntentId(paymentIntentId: string): Promise<EventTeamPayment | null>;
  save(payment: EventTeamPayment): Promise<void>;
}
