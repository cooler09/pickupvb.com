import {
  NotFoundError,
  EventTeamRegistration,
  RegistrationMember,
  RegistrationPaymentStatus,
  type DivisionId,
  type EventTeamRegistrationId,
  type EventTeamRegistrationMemberId,
  type EventTeamRegistrationRepository,
  type UserId,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type RegistrationRow = {
  id: string;
  event_id: string;
  division_id: string;
  captain_id: string;
  name: string;
  payment_status: RegistrationPaymentStatus;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  amount_paid_cents: number | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  sort_order: number;
};

/**
 * Adapter for the {@link EventTeamRegistration} aggregate. Persists to
 * `event_team_registrations` + `event_team_registration_members`.
 *
 * Roster reconciliation follows the same clear-and-insert pattern as
 * `SupabaseTeamRepository`: rosters are tiny (≤ ~14 even for sixes + subs)
 * so the cost is negligible and the code stays simple.
 */
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
    const { count, error } = await this.client
      .from('event_team_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('captain_id', captainId)
      .eq('division_id', divisionId)
      // A soft-deleted registration must not block re-registration in the
      // same division; the row sticks around for audit/refund reconciliation
      // (see migration 20260629000000) but is logically gone from product.
      .is('deleted_at', null);
    if (error) {
      throw new Error(
        `EventTeamRegistration.existsForCaptainInDivision(${eventId}, ${captainId}, ${divisionId}) failed: ${error.message}`,
      );
    }
    return (count ?? 0) > 0;
  }

  async save(registration: EventTeamRegistration): Promise<void> {
    const row = {
      id: String(registration.id),
      event_id: registration.eventId,
      division_id: String(registration.divisionId),
      captain_id: String(registration.captainId),
      name: registration.name,
      payment_status: registration.paymentStatus,
      checkout_session_id: registration.checkoutSessionId,
      payment_intent_id: registration.paymentIntentId,
      amount_paid_cents: registration.amountPaidCents,
      paid_at: registration.paidAt ? registration.paidAt.toISOString() : null,
    };

    const { error } = await this.client
      .from('event_team_registrations')
      .upsert(row as never, { onConflict: 'id' });
    if (error) {
      throw new Error(`EventTeamRegistration.save(${registration.id}) failed: ${error.message}`);
    }

    // Reconcile members.
    const { error: delErr } = await this.client
      .from('event_team_registration_members')
      .delete()
      .eq('registration_id', String(registration.id));
    if (delErr) {
      throw new Error(`EventTeamRegistration.save member clear failed: ${delErr.message}`);
    }

    if (registration.members.length === 0) {
      await this.ensureBackingTeam(registration);
      return;
    }

    const memberRows = registration.members.map((m) => ({
      id: String(m.id),
      registration_id: String(registration.id),
      user_id: m.userId ? String(m.userId) : null,
      display_name: m.displayName,
      email: m.email,
      sort_order: m.sortOrder,
    }));
    const { error: insErr } = await this.client
      .from('event_team_registration_members')
      .insert(memberRows as never);
    if (insErr) {
      throw new Error(`EventTeamRegistration.save members insert failed: ${insErr.message}`);
    }

    await this.ensureBackingTeam(registration);
  }

  /**
   * Promote (or rename) the backing `teams` + `event_teams` rows that
   * make the registration first-class for the bracket reader and the
   * `events_view.team_count` expression. See ADR 0013 (Option B) and
   * migration `20260705000000_promote_ad_hoc_registrations_to_teams.sql`.
   *
   * Idempotent: a follow-up `save` skips creation and only renames the
   * backing team when the name changed.
   */
  private async ensureBackingTeam(registration: EventTeamRegistration): Promise<void> {
    const { data: regRow, error: regErr } = await this.client
      .from('event_team_registrations')
      .select('team_id')
      .eq('id', String(registration.id))
      .maybeSingle();
    if (regErr) {
      throw new Error(`EventTeamRegistration.ensureBackingTeam read failed: ${regErr.message}`);
    }
    const existingTeamId = (regRow as { team_id: string | null } | null)?.team_id ?? null;

    if (existingTeamId) {
      // Rename path: keep teams.name in sync with the registration.
      const { error: rnErr } = await this.client
        .from('teams')
        .update({ name: registration.name } as never)
        .eq('id', existingTeamId)
        .neq('name', registration.name);
      if (rnErr) {
        throw new Error(`EventTeamRegistration.ensureBackingTeam rename failed: ${rnErr.message}`);
      }
      return;
    }

    // Need the event's format to populate teams.format.
    const { data: evtRow, error: evtErr } = await this.client
      .from('events')
      .select('format')
      .eq('id', registration.eventId)
      .maybeSingle();
    if (evtErr || !evtRow) {
      throw new Error(
        `EventTeamRegistration.ensureBackingTeam event lookup failed: ${
          evtErr?.message ?? 'event not found'
        }`,
      );
    }
    const evtFormat = (evtRow as unknown as { format: string }).format;

    const { data: newTeam, error: tErr } = await this.client
      .from('teams')
      .insert({
        captain_id: String(registration.captainId),
        name: registration.name,
        format: evtFormat,
      } as never)
      .select('id')
      .single();
    if (tErr || !newTeam) {
      throw new Error(
        `EventTeamRegistration.ensureBackingTeam team insert failed: ${
          tErr?.message ?? 'no row returned'
        }`,
      );
    }
    const newTeamId = (newTeam as { id: string }).id;

    const { error: linkErr } = await this.client
      .from('event_team_registrations')
      .update({ team_id: newTeamId } as never)
      .eq('id', String(registration.id));
    if (linkErr) {
      throw new Error(`EventTeamRegistration.ensureBackingTeam link failed: ${linkErr.message}`);
    }

    const { error: etErr } = await this.client.from('event_teams').insert({
      event_id: registration.eventId,
      team_id: newTeamId,
      division_id: String(registration.divisionId),
    } as never);
    if (etErr) {
      throw new Error(
        `EventTeamRegistration.ensureBackingTeam event_teams insert failed: ${etErr.message}`,
      );
    }
  }

  /**
   * Read the backing-team link for a registration before removal so we
   * can clean up the `event_teams` row. The `teams` row itself is
   * intentionally preserved on withdraw (history per ADR 0013).
   */
  private async detachBackingTeamLink(id: EventTeamRegistrationId): Promise<void> {
    const { data, error } = await this.client
      .from('event_team_registrations')
      .select('event_id, team_id')
      .eq('id', String(id))
      .maybeSingle();
    if (error) {
      throw new Error(`EventTeamRegistration.detachBackingTeamLink read failed: ${error.message}`);
    }
    const row = data as { event_id: string; team_id: string | null } | null;
    if (!row || !row.team_id) return;
    const { error: etErr } = await this.client
      .from('event_teams')
      .delete()
      .eq('event_id', row.event_id)
      .eq('team_id', row.team_id);
    if (etErr) {
      throw new Error(
        `EventTeamRegistration.detachBackingTeamLink event_teams delete failed: ${etErr.message}`,
      );
    }
  }

  async delete(id: EventTeamRegistrationId): Promise<void> {
    await this.detachBackingTeamLink(id);
    // Cascade on the FK handles members; we only need the parent delete.
    const { error } = await this.client
      .from('event_team_registrations')
      .delete()
      .eq('id', String(id));
    if (error) {
      throw new Error(`EventTeamRegistration.delete(${id}) failed: ${error.message}`);
    }
  }

  async softDelete(id: EventTeamRegistrationId): Promise<void> {
    await this.detachBackingTeamLink(id);
    const { error } = await this.client
      .from('event_team_registrations')
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
    const { data, error } = await this.client
      .from('event_team_registrations')
      .select(
        'id, event_id, division_id, captain_id, name, payment_status, checkout_session_id, payment_intent_id, amount_paid_cents, paid_at, created_at, updated_at',
      )
      .eq(column, value)
      .maybeSingle();
    if (error) {
      throw new Error(`EventTeamRegistration.find(${column}=${value}) failed: ${error.message}`);
    }
    if (!data) return null;
    const row = data as RegistrationRow;

    const { data: memberRows, error: mErr } = await this.client
      .from('event_team_registration_members')
      .select('id, user_id, display_name, email, sort_order')
      .eq('registration_id', row.id)
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

    return EventTeamRegistration.rehydrate({
      id: row.id as never as EventTeamRegistrationId,
      eventId: row.event_id,
      divisionId: row.division_id as never as DivisionId,
      captainId: row.captain_id as UserId,
      name: row.name,
      members,
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
