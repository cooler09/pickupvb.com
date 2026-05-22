import {
  EventTeamPayment,
  RegistrationPaymentStatus,
  type EventTeamPaymentId,
  type EventTeamPaymentRepository,
  type UserId,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type PaymentRow = {
  id: string;
  event_id: string;
  team_id: string;
  captain_id: string;
  payment_status: RegistrationPaymentStatus;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  amount_paid_cents: number | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Adapter for the {@link EventTeamPayment} aggregate. Persists to the
 * sidecar `event_team_payments` table (ADR 0007 — roster-mode per-team
 * captain checkout).
 */
export class SupabaseEventTeamPaymentRepository implements EventTeamPaymentRepository {
  private _client: SupabaseClient | null = null;

  private get client(): SupabaseClient {
    if (!this._client) this._client = createSupabaseAdminClient();
    return this._client;
  }

  async findById(id: EventTeamPaymentId): Promise<EventTeamPayment | null> {
    return this.loadBy('id', String(id));
  }

  async findByEventAndTeam(eventId: string, teamId: string): Promise<EventTeamPayment | null> {
    const { data, error } = await this.client
      .from('event_team_payments')
      .select(
        'id, event_id, team_id, captain_id, payment_status, checkout_session_id, payment_intent_id, amount_paid_cents, paid_at, created_at, updated_at',
      )
      .eq('event_id', eventId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (error) {
      throw new Error(
        `EventTeamPayment.findByEventAndTeam(${eventId}, ${teamId}) failed: ${error.message}`,
      );
    }
    return data ? this.hydrate(data as PaymentRow) : null;
  }

  async findByCheckoutSessionId(sessionId: string): Promise<EventTeamPayment | null> {
    return this.loadBy('checkout_session_id', sessionId);
  }

  async findByPaymentIntentId(paymentIntentId: string): Promise<EventTeamPayment | null> {
    return this.loadBy('payment_intent_id', paymentIntentId);
  }

  async save(payment: EventTeamPayment): Promise<void> {
    const row = {
      id: String(payment.id),
      event_id: payment.eventId,
      team_id: payment.teamId,
      captain_id: String(payment.captainId),
      payment_status: payment.paymentStatus,
      checkout_session_id: payment.checkoutSessionId,
      payment_intent_id: payment.paymentIntentId,
      amount_paid_cents: payment.amountPaidCents,
      paid_at: payment.paidAt ? payment.paidAt.toISOString() : null,
    };
    const { error } = await this.client
      .from('event_team_payments')
      .upsert(row as never, { onConflict: 'id' });
    if (error) {
      throw new Error(`EventTeamPayment.save(${payment.id}) failed: ${error.message}`);
    }
  }

  private async loadBy(
    column: 'id' | 'checkout_session_id' | 'payment_intent_id',
    value: string,
  ): Promise<EventTeamPayment | null> {
    const { data, error } = await this.client
      .from('event_team_payments')
      .select(
        'id, event_id, team_id, captain_id, payment_status, checkout_session_id, payment_intent_id, amount_paid_cents, paid_at, created_at, updated_at',
      )
      .eq(column, value)
      .maybeSingle();
    if (error) {
      throw new Error(`EventTeamPayment.find(${column}=${value}) failed: ${error.message}`);
    }
    return data ? this.hydrate(data as PaymentRow) : null;
  }

  private hydrate(row: PaymentRow): EventTeamPayment {
    return EventTeamPayment.rehydrate({
      id: row.id as never as EventTeamPaymentId,
      eventId: row.event_id,
      teamId: row.team_id,
      captainId: row.captain_id as UserId,
      paymentStatus: row.payment_status,
      checkoutSessionId: row.checkout_session_id,
      paymentIntentId: row.payment_intent_id,
      amountPaidCents: row.amount_paid_cents,
      paidAt: row.paid_at ? new Date(row.paid_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
