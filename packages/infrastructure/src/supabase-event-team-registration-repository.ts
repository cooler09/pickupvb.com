import {
  NotFoundError,
  EventTeamRegistration,
  RegistrationMember,
  RegistrationPaymentStatus,
  RegistrationSource,
  type DivisionId,
  type EventTeamRegistrationId,
  type EventTeamRegistrationMemberId,
  type EventTeamRegistrationRepository,
  type UserId,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Post-Step-5b shape: the three tables (event_teams, event_team_registrations,
 * event_team_registration_members) collapsed into `event_team_entries` +
 * `event_team_entry_members`. The DB `source` enum is `roster | ad_hoc |
 * walk_in`. As of Step 5b.ii the aggregate enum collapsed to
 * `captain | walk_in`, so the boundary mapping is a bijection
 * (`captain <-> ad_hoc`, `walk_in <-> walk_in`).
 *
 * `EventTeamRegistration` aggregates only represent ad-hoc / walk-in
 * entries — `source = 'roster'` rows are read by other adapters
 * (bracket reader, event_team_payments lookup). All reads here filter
 * `source != 'roster'`.
 */

type EntryRow = {
  id: string;
  event_id: string;
  division_id: string;
  source: 'roster' | 'ad_hoc' | 'walk_in';
  team_id: string | null;
  captain_id: string | null;
  display_name: string;
  captain_display_name: string | null;
  captain_phone: string | null;
  forfeited_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentRow = {
  payment_status: RegistrationPaymentStatus;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  amount_paid_cents: number | null;
  paid_at: string | null;
  payment_note: string | null;
};

const DEFAULT_PAYMENT: PaymentRow = {
  payment_status: 'none' as RegistrationPaymentStatus,
  checkout_session_id: null,
  payment_intent_id: null,
  amount_paid_cents: null,
  paid_at: null,
  payment_note: null,
};

type MemberRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  sort_order: number;
};

function aggregateSourceToDb(source: RegistrationSource): 'ad_hoc' | 'walk_in' {
  return source === RegistrationSource.WalkIn ? 'walk_in' : 'ad_hoc';
}

function dbSourceToAggregate(source: 'roster' | 'ad_hoc' | 'walk_in'): RegistrationSource {
  if (source === 'walk_in') return RegistrationSource.WalkIn;
  return RegistrationSource.Captain;
}

export class SupabaseEventTeamRegistrationRepository implements EventTeamRegistrationRepository {
  private _client: SupabaseClient | null = null;

  private get client(): SupabaseClient {
    if (!this._client) this._client = createSupabaseAdminClient();
    return this._client;
  }

  async findById(id: EventTeamRegistrationId): Promise<EventTeamRegistration | null> {
    return this.loadOne('id', String(id));
  }

  async findByCheckoutSessionId(sessionId: string): Promise<EventTeamRegistration | null> {
    return this.loadOne('checkout_session_id', sessionId);
  }

  async findByPaymentIntentId(paymentIntentId: string): Promise<EventTeamRegistration | null> {
    return this.loadOne('payment_intent_id', paymentIntentId);
  }

  async existsForCaptainInDivision(
    eventId: string,
    captainId: string,
    divisionId: string,
  ): Promise<boolean> {
    void eventId;
    const { count, error } = await this.client
      .from('event_team_entries')
      .select('id', { count: 'exact', head: true })
      .eq('captain_id', captainId)
      .eq('division_id', divisionId)
      .neq('source', 'roster')
      .is('deleted_at', null);
    if (error) {
      throw new Error(
        `EventTeamRegistration.existsForCaptainInDivision(${eventId}, ${captainId}, ${divisionId}) failed: ${error.message}`,
      );
    }
    return (count ?? 0) > 0;
  }

  async save(registration: EventTeamRegistration): Promise<void> {
    const entryRow = {
      id: String(registration.id),
      division_id: String(registration.divisionId),
      source: aggregateSourceToDb(registration.source),
      team_id: null,
      captain_id: registration.captainId === null ? null : String(registration.captainId),
      display_name: registration.name,
      captain_display_name: registration.captainDisplayName,
      captain_phone: registration.captainPhone,
      forfeited_at: registration.forfeitedAt ? registration.forfeitedAt.toISOString() : null,
    };

    const { error } = await this.client
      .from('event_team_entries')
      .upsert(entryRow as never, { onConflict: 'id' });
    if (error) {
      throw new Error(`EventTeamRegistration.save(${registration.id}) failed: ${error.message}`);
    }

    // Payment columns moved off entries onto event_team_payments
    // (1:1 via entry_id unique). Always upsert so the row exists even
    // when the aggregate has no payment activity — keeps reads simple.
    const paymentRow = {
      entry_id: String(registration.id),
      captain_id: registration.captainId === null ? null : String(registration.captainId),
      payment_status: registration.paymentStatus,
      checkout_session_id: registration.checkoutSessionId,
      payment_intent_id: registration.paymentIntentId,
      amount_paid_cents: registration.amountPaidCents,
      paid_at: registration.paidAt ? registration.paidAt.toISOString() : null,
      payment_note: registration.paymentNote,
    };
    const { error: payErr } = await this.client
      .from('event_team_payments')
      .upsert(paymentRow as never, { onConflict: 'entry_id' });
    if (payErr) {
      throw new Error(
        `EventTeamRegistration.save payment(${registration.id}) failed: ${payErr.message}`,
      );
    }

    const { error: delErr } = await this.client
      .from('event_team_entry_members')
      .delete()
      .eq('entry_id', String(registration.id));
    if (delErr) {
      throw new Error(`EventTeamRegistration.save member clear failed: ${delErr.message}`);
    }

    if (registration.members.length === 0) return;

    const memberRows = registration.members.map((m) => ({
      id: String(m.id),
      entry_id: String(registration.id),
      user_id: m.userId ? String(m.userId) : null,
      display_name: m.displayName,
      email: m.email,
      sort_order: m.sortOrder,
    }));
    const { error: insErr } = await this.client
      .from('event_team_entry_members')
      .insert(memberRows as never);
    if (insErr) {
      throw new Error(`EventTeamRegistration.save members insert failed: ${insErr.message}`);
    }
  }

  async delete(id: EventTeamRegistrationId): Promise<void> {
    const { error } = await this.client.from('event_team_entries').delete().eq('id', String(id));
    if (error) {
      throw new Error(`EventTeamRegistration.delete(${id}) failed: ${error.message}`);
    }
  }

  async softDelete(id: EventTeamRegistrationId): Promise<void> {
    const { error } = await this.client
      .from('event_team_entries')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', String(id))
      .is('deleted_at', null);
    if (error) {
      throw new Error(`EventTeamRegistration.softDelete(${id}) failed: ${error.message}`);
    }
  }

  private async loadOne(
    column: 'id' | 'checkout_session_id' | 'payment_intent_id',
    value: string,
  ): Promise<EventTeamRegistration | null> {
    // Payment lookups go through event_team_payments — resolve to an
    // entry_id first, then read the entry.
    let entryId: string;
    if (column === 'id') {
      entryId = value;
    } else {
      const { data: payHit, error: payErr } = await this.client
        .from('event_team_payments')
        .select('entry_id')
        .eq(column, value)
        .maybeSingle();
      if (payErr) {
        throw new Error(
          `EventTeamRegistration.find(${column}=${value}) payment lookup failed: ${payErr.message}`,
        );
      }
      if (!payHit) return null;
      entryId = (payHit as { entry_id: string }).entry_id;
    }

    const { data, error } = await this.client
      .from('event_team_entries')
      .select(
        'id, division_id, source, team_id, captain_id, display_name, captain_display_name, captain_phone, forfeited_at, created_at, updated_at, event_divisions!event_team_entries_division_id_fkey!inner(event_id), payments:event_team_payments(payment_status, checkout_session_id, payment_intent_id, amount_paid_cents, paid_at, payment_note)',
      )
      .eq('id', entryId)
      .neq('source', 'roster')
      .maybeSingle();
    if (error) {
      throw new Error(`EventTeamRegistration.find(${column}=${value}) failed: ${error.message}`);
    }
    if (!data) return null;
    type Raw = Omit<EntryRow, 'event_id'> & {
      event_divisions: { event_id: string };
      payments: PaymentRow[] | PaymentRow | null;
    };
    const raw = data as unknown as Raw;
    const row: EntryRow = {
      id: raw.id,
      event_id: raw.event_divisions.event_id,
      division_id: raw.division_id,
      source: raw.source,
      team_id: raw.team_id,
      captain_id: raw.captain_id,
      display_name: raw.display_name,
      captain_display_name: raw.captain_display_name,
      captain_phone: raw.captain_phone,
      forfeited_at: raw.forfeited_at,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    };
    const payment: PaymentRow = Array.isArray(raw.payments)
      ? (raw.payments[0] ?? DEFAULT_PAYMENT)
      : (raw.payments ?? DEFAULT_PAYMENT);

    const { data: memberRows, error: mErr } = await this.client
      .from('event_team_entry_members')
      .select('id, user_id, display_name, email, sort_order')
      .eq('entry_id', row.id)
      .order('sort_order', { ascending: true });
    if (mErr) {
      throw new Error(`EventTeamRegistration.find members(${row.id}) failed: ${mErr.message}`);
    }

    const members = ((memberRows as MemberRow[] | null) ?? []).map((m) =>
      RegistrationMember.create({
        id: m.id as never as EventTeamRegistrationMemberId,
        userId: m.user_id ? (m.user_id as UserId) : null,
        displayName: m.display_name,
        email: m.email,
        sortOrder: m.sort_order,
      }),
    );

    const isWalkIn = row.source === 'walk_in';

    return EventTeamRegistration.rehydrate({
      id: row.id as never as EventTeamRegistrationId,
      eventId: row.event_id,
      divisionId: row.division_id as never as DivisionId,
      captainId: row.captain_id === null ? null : (row.captain_id as UserId),
      name: row.display_name,
      members,
      source: dbSourceToAggregate(row.source),
      captainDisplayName: isWalkIn ? row.captain_display_name : null,
      captainPhone: row.captain_phone,
      paymentStatus: payment.payment_status,
      checkoutSessionId: payment.checkout_session_id,
      paymentIntentId: payment.payment_intent_id,
      amountPaidCents: payment.amount_paid_cents,
      paidAt: payment.paid_at ? new Date(payment.paid_at) : null,
      paymentNote: payment.payment_note,
      forfeitedAt: row.forfeited_at ? new Date(row.forfeited_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}

void RegistrationPaymentStatus;

/**
 * Convenience for call sites that want a typed `NotFoundError` rather than
 * `null` when the registration is missing.
 */
export async function loadEventTeamRegistrationOrThrow(
  repo: EventTeamRegistrationRepository,
  id: string,
): Promise<EventTeamRegistration> {
  const registration = await repo.findById(id as never as EventTeamRegistrationId);
  if (!registration) throw new NotFoundError('event_team_registration', id);
  return registration;
}
