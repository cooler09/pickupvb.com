import {
  EventTeamPayment,
  RegistrationPaymentStatus,
  type EventTeamPaymentId,
  type EventTeamPaymentRepository,
  type UserId,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Post-Step-5b: `event_team_payments` is keyed by `entry_id` (FK to
 * `event_team_entries`). The aggregate still exposes `eventId` + `teamId`
 * so the rest of the app didn't have to churn — we resolve to the entry
 * here at the boundary by joining
 * `event_team_entries WHERE source = 'roster' AND team_id = $teamId AND
 *  division.event_id = $eventId`.
 *
 * Roster-mode is the only path that creates an `event_team_payments` row,
 * so the lookup is guaranteed to land on a single roster entry.
 */
type PaymentRow = {
  id: string;
  entry_id: string;
  captain_id: string;
  payment_status: RegistrationPaymentStatus;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  amount_paid_cents: number | null;
  paid_at: string | null;
  payment_note: string | null;
  created_at: string;
  updated_at: string;
  entry: {
    team_id: string | null;
    division: { event_id: string } | null;
  } | null;
};

const SELECT_COLS =
  'id, entry_id, captain_id, payment_status, checkout_session_id, payment_intent_id, amount_paid_cents, paid_at, payment_note, created_at, updated_at, entry:event_team_entries!inner(team_id, division:event_divisions!event_team_entries_division_id_fkey!inner(event_id))';

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
    const entryId = await this.resolveEntryId(eventId, teamId);
    if (!entryId) return null;
    const { data, error } = await this.client
      .from('event_team_payments')
      .select(SELECT_COLS)
      .eq('entry_id', entryId)
      .maybeSingle();
    if (error) {
      throw new Error(
        `EventTeamPayment.findByEventAndTeam(${eventId}, ${teamId}) failed: ${error.message}`,
      );
    }
    return data ? this.hydrate(data as unknown as PaymentRow) : null;
  }

  async findByCheckoutSessionId(sessionId: string): Promise<EventTeamPayment | null> {
    return this.loadBy('checkout_session_id', sessionId);
  }

  async findByPaymentIntentId(paymentIntentId: string): Promise<EventTeamPayment | null> {
    return this.loadBy('payment_intent_id', paymentIntentId);
  }

  async save(payment: EventTeamPayment): Promise<void> {
    const entryId = await this.resolveEntryId(payment.eventId, payment.teamId);
    if (!entryId) {
      throw new Error(
        `EventTeamPayment.save(${payment.id}): no roster entry for event ${payment.eventId} / team ${payment.teamId}`,
      );
    }

    const row = {
      id: String(payment.id),
      entry_id: entryId,
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

  private async resolveEntryId(eventId: string, teamId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from('event_team_entries')
      .select('id, division:event_divisions!event_team_entries_division_id_fkey!inner(event_id)')
      .eq('team_id', teamId)
      .eq('source', 'roster')
      .eq('division.event_id', eventId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      throw new Error(
        `EventTeamPayment.resolveEntryId(${eventId}, ${teamId}) failed: ${error.message}`,
      );
    }
    return (data as { id: string } | null)?.id ?? null;
  }

  private async loadBy(
    column: 'id' | 'checkout_session_id' | 'payment_intent_id',
    value: string,
  ): Promise<EventTeamPayment | null> {
    const { data, error } = await this.client
      .from('event_team_payments')
      .select(SELECT_COLS)
      .eq(column, value)
      .maybeSingle();
    if (error) {
      throw new Error(`EventTeamPayment.find(${column}=${value}) failed: ${error.message}`);
    }
    return data ? this.hydrate(data as unknown as PaymentRow) : null;
  }

  private hydrate(row: PaymentRow): EventTeamPayment {
    const eventId = row.entry?.division?.event_id;
    const teamId = row.entry?.team_id;
    if (!eventId || !teamId) {
      throw new Error(
        `EventTeamPayment.hydrate(${row.id}): missing entry/division/team join (row.entry=${JSON.stringify(row.entry)})`,
      );
    }
    return EventTeamPayment.rehydrate({
      id: row.id as never as EventTeamPaymentId,
      eventId,
      teamId,
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
