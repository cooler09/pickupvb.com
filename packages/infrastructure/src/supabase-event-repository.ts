import {
  AgeGroup,
  Capacity,
  Division,
  DivisionId,
  EventStatus,
  EventType,
  Format,
  Gender,
  Location,
  PriceUnit,
  RegistrationMode,
  SkillLevel,
  SkillTier,
  Surface,
  TeamComposition,
  TeamId,
  TeamRegistrationMode,
  UserId,
  Visibility,
  VolleyballEvent,
  isEventPosition,
  skillTierBand,
  type CoHostParty,
  type DivisionLite,
  type EventBracketMetaReadModel,
  type EventDetailReadModel,
  type EventPosition,
  type EventRepository,
  type EventSearchQuery,
  type VolleyballEventSummary,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import {
  computeSpotsRemaining,
  indexPaymentsByTeam,
  mapAttendees,
  mapCoHosts,
  mapFreeAgents,
  mapRegisteredTeams,
  mapViewerCaptainedTeams,
  mapViewerHostableGroups,
  mapWinnerLabels,
  tallyTeamMembers,
  toGroupLite,
  toProfileLite,
  type AttendeeRow,
  type CoHostJoinRow,
  type FreeAgentRow,
  type GroupRow,
  type HostableGroupRow,
  type ProfileRow,
  type TeamJoinRow,
  type TeamPaymentRow,
  type ViewerTeamRow,
  type WinnerEntryRow,
} from './event-detail/mappers.js';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type EventRow = {
  id: string;
  short_code: string;
  host_id: string;
  title: string;
  description: string;
  rules: string;
  surface: Surface;
  format: Format | null;
  gender: Gender | null;
  skill_level: SkillLevel | null;
  type: EventType;
  visibility: Visibility;
  status: EventStatus;
  address_line: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  starts_at: string;
  ends_at: string;
  time_zone: string | null;
  capacity_kind: 'fixed' | 'unlimited' | null;
  max_spots: number | null;
  latitude: number;
  longitude: number;
  attendee_count: number;
  team_count: number;
  // ADR 0006 extension columns (nullable / defaulted at DB)
  venue_name: string | null;
  registration_closes_at: string | null;
  series_name: string | null;
  series_position: number | null;
  series_size: number | null;
  is_fundraiser: boolean | null;
  fundraiser_beneficiary: string | null;
  theme_tags: string[] | null;
  sanctioning_body: string | null;
  registration_mode: RegistrationMode | null;
  external_registration_url: string | null;
  external_registration_instructions: string | null;
  payment_instructions: string | null;
  payments_off_platform: boolean | null;
};

type DivisionRow = {
  id: string;
  event_id: string;
  sort_order: number;
  label: string;
  surface: Surface;
  format: Format;
  gender: Gender;
  skill_tier: SkillTier;
  age_group: AgeGroup;
  tier_label: string | null;
  team_composition: TeamComposition;
  team_size: number | null;
  capacity_kind: 'fixed' | 'unlimited' | null;
  max_spots: number | null;
  price_cents: number | null;
  price_unit: PriceUnit;
  prize_text: string | null;
  prize_purse_cents: number | null;
  starts_at: string | null;
  ends_at: string | null;
  winner_entry_id: string | null;
  winner_recorded_at: string | null;
  allow_free_agents: boolean;
  team_registration_mode: TeamRegistrationMode | null;
  position_roster: Record<string, number> | null;
};

/**
 * Single source for the `{ capacity_kind, max_spots }` → `Capacity` mapping.
 * Both `events` and `event_divisions` carry the identical pair of columns, so
 * one helper serves event rows and division rows alike (architecture audit
 * P2-3 dedup — was duplicated as `rowToCapacity` / `divisionRowToCapacity`).
 */
function capacityFromRow(row: {
  capacity_kind: 'fixed' | 'unlimited' | null;
  max_spots: number | null;
}): Capacity | null {
  if (row.capacity_kind === 'unlimited') return Capacity.unlimited();
  if (row.capacity_kind === 'fixed' && row.max_spots !== null) return Capacity.fixed(row.max_spots);
  return null;
}

/**
 * Fallback shim: derive the legacy single-event display fields (format,
 * gender, skill_level, capacity) from the first division when the event
 * columns are null. ADR 0006 Phase 9b routed hydrate off the legacy
 * columns; Phase 9c will DROP them. Until then we tolerate either source.
 */
function primaryDivisionFallback(
  row: EventRow,
  divisions: ReadonlyArray<DivisionRow>,
): {
  format: Format | null;
  gender: Gender | null;
  skillLevel: SkillLevel;
  capacity: Capacity | null;
} {
  const d = divisions[0] ?? null;
  return {
    format: row.format ?? d?.format ?? null,
    gender: row.gender ?? d?.gender ?? null,
    skillLevel:
      row.skill_level ??
      (d ? (skillTierBand(d.skill_tier) as SkillLevel) : SkillLevel.Intermediate),
    capacity: capacityFromRow(row) ?? (d ? capacityFromRow(d) : null),
  };
}

function divisionRowToPositionRoster(
  row: DivisionRow | undefined,
): Map<EventPosition, number> | null {
  const raw = row?.position_roster;
  if (!raw || typeof raw !== 'object') return null;
  const out = new Map<EventPosition, number>();
  for (const [key, value] of Object.entries(raw)) {
    if (!isEventPosition(key)) continue;
    if (typeof value === 'number' && value > 0) out.set(key, value);
  }
  return out.size > 0 ? out : null;
}

function divisionRowToDomain(row: DivisionRow): Division {
  return Division.fromPersistence({
    id: row.id as never,
    sortOrder: row.sort_order,
    label: row.label,
    surface: row.surface,
    format: row.format,
    gender: row.gender,
    skillTier: row.skill_tier,
    ageGroup: row.age_group,
    tierLabel: row.tier_label,
    teamComposition: row.team_composition,
    teamSize: row.team_size,
    capacity: capacityFromRow(row),
    priceCents: row.price_cents,
    priceUnit: row.price_unit,
    prizeText: row.prize_text,
    prizePurseCents: row.prize_purse_cents,
    startsAt: row.starts_at ? new Date(row.starts_at) : null,
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    allowFreeAgents: row.allow_free_agents ?? true,
    teamRegistrationMode: row.team_registration_mode ?? null,
  });
}

function divisionRowToLite(row: DivisionRow, winnerLabel: string | null): DivisionLite {
  const winner =
    winnerLabel !== null && row.winner_recorded_at !== null
      ? { label: winnerLabel, recordedAt: new Date(row.winner_recorded_at) }
      : null;
  return {
    id: row.id,
    sortOrder: row.sort_order,
    label: row.label,
    surface: row.surface,
    format: row.format,
    gender: row.gender,
    skillTier: row.skill_tier,
    ageGroup: row.age_group,
    tierLabel: row.tier_label,
    teamComposition: row.team_composition,
    teamSize: row.team_size,
    capacityKind: row.capacity_kind,
    maxSpots: row.max_spots,
    priceCents: row.price_cents,
    priceUnit: row.price_unit,
    prizeText: row.prize_text,
    prizePurseCents: row.prize_purse_cents,
    startsAt: row.starts_at ? new Date(row.starts_at) : null,
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    allowFreeAgents: row.allow_free_agents ?? true,
    teamRegistrationMode: row.team_registration_mode ?? null,
    winner,
  };
}

function divisionToRow(eventId: string, d: Division): Record<string, unknown> {
  return {
    id: String(d.id),
    event_id: eventId,
    sort_order: d.sortOrder,
    label: d.label,
    surface: d.surface,
    format: d.format,
    gender: d.gender,
    skill_tier: d.skillTier,
    age_group: d.ageGroup,
    tier_label: d.tierLabel,
    team_composition: d.teamComposition,
    team_size: d.teamSize,
    capacity_kind: d.capacity?.kind ?? null,
    max_spots: d.capacity?.kind === 'fixed' ? d.capacity.maxSpots : null,
    price_cents: d.priceCents,
    price_unit: d.priceUnit,
    prize_text: d.prizeText,
    prize_purse_cents: d.prizePurseCents,
    starts_at: d.startsAt ? d.startsAt.toISOString() : null,
    ends_at: d.endsAt ? d.endsAt.toISOString() : null,
    allow_free_agents: d.allowFreeAgents,
    team_registration_mode: d.teamRegistrationMode,
  };
}

function rowToExtensions(row: EventRow) {
  return {
    venueName: row.venue_name,
    registrationClosesAt: row.registration_closes_at ? new Date(row.registration_closes_at) : null,
    seriesName: row.series_name,
    seriesPosition: row.series_position,
    seriesSize: row.series_size,
    isFundraiser: row.is_fundraiser ?? false,
    fundraiserBeneficiary: row.fundraiser_beneficiary,
    themeTags: row.theme_tags ?? [],
    sanctioningBody: row.sanctioning_body,
    registrationMode: row.registration_mode ?? RegistrationMode.Platform,
    externalRegistrationUrl: row.external_registration_url,
    externalRegistrationInstructions: row.external_registration_instructions,
    paymentInstructions: row.payment_instructions,
    paymentsOffPlatform: row.payments_off_platform ?? false,
  };
}

export class SupabaseEventRepository implements EventRepository {
  private _client: SupabaseClient | null = null;

  private get client(): SupabaseClient {
    if (!this._client) this._client = createSupabaseAdminClient();
    return this._client;
  }

  async findById(id: string): Promise<VolleyballEvent | null> {
    const { data, error } = await this.client
      .from('events_view')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`findById(${id}) failed: ${error.message}`);
    if (!data) return null;
    const row = data as unknown as EventRow;

    const [
      { data: attendees, error: aErr },
      { data: teams, error: tErr },
      { data: freeAgents, error: fErr },
      { data: divisions, error: dErr },
    ] = await Promise.all([
      this.client
        .from('event_participants')
        .select('user_id, position, division:event_divisions!inner(event_id)')
        .eq('role', 'attendee')
        .eq('division.event_id', id),
      this.client
        .from('event_team_entries')
        .select(
          'team_id, division_id, division:event_divisions!event_team_entries_division_id_fkey!inner(event_id)',
        )
        .eq('division.event_id', id)
        .eq('source', 'roster')
        .is('deleted_at', null),
      this.client
        .from('event_participants')
        .select('user_id, notes, division_id, division:event_divisions!inner(event_id)')
        .eq('role', 'free_agent')
        .eq('division.event_id', id),
      this.client
        .from('event_divisions')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true }),
    ]);
    if (aErr) throw new Error(`findById attendees failed: ${aErr.message}`);
    if (tErr) throw new Error(`findById teams failed: ${tErr.message}`);
    if (fErr) throw new Error(`findById free agents failed: ${fErr.message}`);
    if (dErr) throw new Error(`findById divisions failed: ${dErr.message}`);

    const divisionRows = (divisions ?? []) as DivisionRow[];
    const legacy = primaryDivisionFallback(row, divisionRows);

    return VolleyballEvent.fromPersistence({
      id: row.id as never,
      hostId: row.host_id as never,
      title: row.title,
      description: row.description,
      rules: row.rules,
      surface: row.surface,
      type: row.type,
      visibility: row.visibility,
      location: Location.create({
        addressLine: row.address_line,
        city: row.city,
        region: row.region,
        postalCode: row.postal_code,
        country: row.country,
        latitude: row.latitude,
        longitude: row.longitude,
      }),
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
      timeZone: row.time_zone,
      capacity: legacy.capacity,
      status: row.status,
      attendees: ((attendees ?? []) as Array<{ user_id: string; position: string | null }>).map(
        (a) => [a.user_id as never, isEventPosition(a.position) ? a.position : null] as const,
      ),
      teams: ((teams ?? []) as Array<{ team_id: string; division_id: string | null }>).map(
        (t) => [TeamId(t.team_id), t.division_id ? DivisionId(t.division_id) : null] as const,
      ),
      freeAgents: (
        (freeAgents ?? []) as Array<{
          user_id: string;
          notes: string | null;
          division_id: string | null;
        }>
      ).map(
        (f) =>
          [
            UserId(f.user_id),
            { divisionId: f.division_id ? DivisionId(f.division_id) : null, notes: f.notes },
          ] as const,
      ),
      positionRoster: divisionRowToPositionRoster(divisionRows[0]),
      extensions: rowToExtensions(row),
      divisions: divisionRows.map(divisionRowToDomain),
    });
  }

  async save(event: VolleyballEvent): Promise<void> {
    const loc = event.location;
    const wkt = `SRID=4326;POINT(${loc.longitude} ${loc.latitude})`;

    const row = {
      id: String(event.id),
      host_id: String(event.hostId),
      title: event.title,
      description: event.description,
      rules: event.rules,
      surface: event.surface,
      type: event.type,
      visibility: event.visibility,
      status: event.status,
      address_line: loc.addressLine,
      city: loc.city,
      region: loc.region,
      postal_code: loc.postalCode,
      country: loc.country,
      geo: wkt,
      starts_at: event.startsAt.toISOString(),
      ends_at: event.endsAt.toISOString(),
      time_zone: event.timeZone,
      // ADR 0006 Phase 9c: legacy event columns (format, gender, skill_level,
      // capacity_kind, max_spots) are no longer written here. Authority
      // lives on event_divisions. positionRoster also lives on the
      // primary division row — stamped below alongside the division
      // reconciliation.
      // ADR 0006 extension columns
      venue_name: event.venueName,
      registration_closes_at: event.registrationClosesAt
        ? event.registrationClosesAt.toISOString()
        : null,
      series_name: event.seriesName,
      series_position: event.seriesPosition,
      series_size: event.seriesSize,
      is_fundraiser: event.isFundraiser,
      fundraiser_beneficiary: event.fundraiserBeneficiary,
      theme_tags: event.themeTags,
      sanctioning_body: event.sanctioningBody,
      registration_mode: event.registrationMode,
      external_registration_url: event.externalRegistrationUrl,
      external_registration_instructions: event.externalRegistrationInstructions,
      payment_instructions: event.paymentInstructions,
      payments_off_platform: event.paymentsOffPlatform,
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.client.from('events').upsert(row as never, { onConflict: 'id' });
    if (error) throw new Error(`save(${event.id}) failed: ${error.message}`);

    // Reconcile attendees by delta. The aggregate's `_attendees` Map carries
    // (userId, position) but NOT `division_id` — that's chosen at signup
    // time and stored on the DB row. After Step 5a the tables no longer
    // carry `event_id`, so we scope reads/writes through the event's
    // division ids:
    //
    //   * Read the current rows via `.in('division_id', divisionIds)`.
    //   * Delete only rows no longer in the aggregate.
    //   * Insert only rows newly added. Attendees are open-play only and
    //     open-play is single-division by invariant, so a new attendee uses
    //     `soleDivisionId`. Teams and free agents now carry their own
    //     division on the aggregate (ADR 0019), so their inserts below use
    //     that — no division-less skip, no side-channel attach port.
    //   * UPDATE rows whose position changed.
    const eventIdForChildren = String(event.id);
    const { data: divIdRows, error: divIdErr } = await this.client
      .from('event_divisions')
      .select('id')
      .eq('event_id', eventIdForChildren);
    if (divIdErr) throw new Error(`save divisions load failed: ${divIdErr.message}`);
    const divisionIds = ((divIdRows as Array<{ id: string }> | null) ?? []).map((r) => r.id);
    const soleDivisionId = divisionIds.length === 1 ? divisionIds[0]! : null;

    const { data: existingAttendeeRows, error: selAErr } = await this.client
      .from('event_participants')
      .select('user_id, position')
      .eq('role', 'attendee')
      .in(
        'division_id',
        divisionIds.length > 0 ? divisionIds : ['00000000-0000-0000-0000-000000000000'],
      );
    if (selAErr) throw new Error(`save attendees load failed: ${selAErr.message}`);
    const existingAttendees = new Map<string, string | null>(
      (
        (existingAttendeeRows as Array<{ user_id: string; position: string | null }> | null) ?? []
      ).map((r) => [r.user_id, r.position]),
    );
    const desiredAttendees = new Map<string, string | null>(
      Array.from(event.attendees.entries()).map(([u, position]) => [String(u), position]),
    );
    const attendeesToDelete: string[] = [];
    for (const userId of existingAttendees.keys()) {
      if (!desiredAttendees.has(userId)) attendeesToDelete.push(userId);
    }
    const attendeesToInsert: Array<{
      division_id: string;
      user_id: string;
      position: string | null;
    }> = [];
    const attendeesToUpdate: Array<{ user_id: string; position: string | null }> = [];
    for (const [userId, position] of desiredAttendees.entries()) {
      if (!existingAttendees.has(userId)) {
        // Multi-division events: dedicated handlers (the ticket-purchase
        // checkout flow) write event_attendees rows directly with the
        // chosen division_id. Skip the aggregate-driven insert here so
        // re-saving the aggregate after such a write doesn't try to
        // duplicate the row in the wrong division.
        if (!soleDivisionId) continue;
        attendeesToInsert.push({ division_id: soleDivisionId, user_id: userId, position });
      } else if (existingAttendees.get(userId) !== position) {
        attendeesToUpdate.push({ user_id: userId, position });
      }
    }
    if (attendeesToDelete.length > 0) {
      const { error: delErr } = await this.client
        .from('event_participants')
        .delete()
        .eq('role', 'attendee')
        .in('division_id', divisionIds)
        .in('user_id', attendeesToDelete);
      if (delErr) throw new Error(`save attendees delete failed: ${delErr.message}`);
    }
    if (attendeesToInsert.length > 0) {
      const rows = attendeesToInsert.map((a) => ({ ...a, role: 'attendee' as const }));
      const { error: insErr } = await this.client.from('event_participants').insert(rows as never);
      if (insErr) throw new Error(`save attendees insert failed: ${insErr.message}`);
    }
    for (const row of attendeesToUpdate) {
      const { error: updErr } = await this.client
        .from('event_participants')
        .update({ position: row.position } as never)
        .eq('role', 'attendee')
        .in('division_id', divisionIds)
        .eq('user_id', row.user_id);
      if (updErr) throw new Error(`save attendees update failed: ${updErr.message}`);
    }

    // Same delta pattern for the roster-mode entries in event_team_entries,
    // scoped through divisionIds. Each desired entry now carries its own
    // division (ADR 0019), so inserts work for single- and multi-division
    // events alike — they route through the `attach_team_to_division` RPC,
    // which resolves captain/name and honours the partial unique index via
    // INSERT … ON CONFLICT DO NOTHING. Ad-hoc / walk-in entries are owned by
    // the EventTeamRegistration aggregate and are intentionally skipped here.
    const desiredTeamDivision = new Map(
      event.teamEntries.map(([t, d]) => [String(t), d ? String(d) : null] as const),
    );
    const desiredTeams = new Set(desiredTeamDivision.keys());
    const { data: existingTeamRows, error: selTErr } = await this.client
      .from('event_team_entries')
      .select('team_id')
      .eq('source', 'roster')
      .is('deleted_at', null)
      .in(
        'division_id',
        divisionIds.length > 0 ? divisionIds : ['00000000-0000-0000-0000-000000000000'],
      );
    if (selTErr) throw new Error(`save teams load failed: ${selTErr.message}`);
    const existingTeams = new Set(
      ((existingTeamRows as Array<{ team_id: string | null }> | null) ?? [])
        .map((r) => r.team_id)
        .filter((v): v is string => !!v),
    );
    const teamsToDelete = Array.from(existingTeams).filter((t) => !desiredTeams.has(t));
    const teamsToInsert = Array.from(desiredTeams).filter((t) => !existingTeams.has(t));
    if (teamsToDelete.length > 0) {
      const { error: delTErr } = await this.client
        .from('event_team_entries')
        .delete()
        .eq('source', 'roster')
        .in('division_id', divisionIds)
        .in('team_id', teamsToDelete);
      if (delTErr) throw new Error(`save teams delete failed: ${delTErr.message}`);
    }
    for (const teamId of teamsToInsert) {
      // Per-entry division (ADR 0019); fall back to the sole division for
      // legacy rows that carry none.
      const teamDivisionId = desiredTeamDivision.get(teamId) ?? soleDivisionId;
      if (!teamDivisionId) continue;
      const { error: insTErr } = await this.client.rpc('attach_team_to_division', {
        p_division_id: teamDivisionId,
        p_team_id: teamId,
      } as never);
      if (insTErr) throw new Error(`save teams insert failed: ${insTErr.message}`);
    }

    // Free agents — delta on membership + notes update.
    const { data: existingFaRows, error: selFErr } = await this.client
      .from('event_participants')
      .select('user_id, notes')
      .eq('role', 'free_agent')
      .in(
        'division_id',
        divisionIds.length > 0 ? divisionIds : ['00000000-0000-0000-0000-000000000000'],
      );
    if (selFErr) throw new Error(`save free agents load failed: ${selFErr.message}`);
    const existingFa = new Map<string, string | null>(
      ((existingFaRows as Array<{ user_id: string; notes: string | null }> | null) ?? []).map(
        (r) => [r.user_id, r.notes],
      ),
    );
    const desiredFa = new Map<string, { divisionId: string | null; notes: string | null }>(
      event.freeAgentEntries.map(([u, e]) => [
        String(u),
        { divisionId: e.divisionId ? String(e.divisionId) : null, notes: e.notes },
      ]),
    );
    const faToDelete: string[] = [];
    for (const userId of existingFa.keys()) {
      if (!desiredFa.has(userId)) faToDelete.push(userId);
    }
    const faToInsert: Array<{ division_id: string; user_id: string; notes: string | null }> = [];
    const faToUpdate: Array<{ user_id: string; notes: string | null }> = [];
    for (const [userId, entry] of desiredFa.entries()) {
      if (!existingFa.has(userId)) {
        // Per-entry division (ADR 0019); fall back to the sole division for
        // legacy rows that carry none.
        const faDivisionId = entry.divisionId ?? soleDivisionId;
        if (!faDivisionId) continue;
        faToInsert.push({ division_id: faDivisionId, user_id: userId, notes: entry.notes });
      } else if (existingFa.get(userId) !== entry.notes) {
        faToUpdate.push({ user_id: userId, notes: entry.notes });
      }
    }
    if (faToDelete.length > 0) {
      const { error: delFErr } = await this.client
        .from('event_participants')
        .delete()
        .eq('role', 'free_agent')
        .in('division_id', divisionIds)
        .in('user_id', faToDelete);
      if (delFErr) throw new Error(`save free agents delete failed: ${delFErr.message}`);
    }
    if (faToInsert.length > 0) {
      const rows = faToInsert.map((f) => ({ ...f, role: 'free_agent' as const }));
      // Upsert on the (division_id, user_id) unique index so a concurrent
      // double-submit is idempotent (matches the removed
      // attachFreeAgentToDivision behaviour — ADR 0019).
      const { error: insFErr } = await this.client
        .from('event_participants')
        .upsert(rows as never, { onConflict: 'division_id,user_id', ignoreDuplicates: true });
      if (insFErr) throw new Error(`save free agents insert failed: ${insFErr.message}`);
    }
    for (const row of faToUpdate) {
      const { error: updErr } = await this.client
        .from('event_participants')
        .update({ notes: row.notes } as never)
        .eq('role', 'free_agent')
        .in('division_id', divisionIds)
        .eq('user_id', row.user_id);
      if (updErr) throw new Error(`save free agents update failed: ${updErr.message}`);
    }

    // Reconcile divisions: upsert current set by id, delete any id no
    // longer present so child rows with `division_id` go to NULL via
    // `on delete set null` and may be re-resolved by the
    // `fill_default_division_id` trigger when the event has exactly one
    // remaining division.
    //
    // When the aggregate carries no divisions (legacy create path that
    // pre-dates multi-division), we skip the delete entirely so the
    // `events_create_default_division` AFTER INSERT trigger's row stays
    // put. Reconciliation only runs when the caller explicitly listed
    // divisions on the aggregate.
    const eventIdStr = String(event.id);
    const divisionRows = event.divisions.map((d) => divisionToRow(eventIdStr, d));
    if (divisionRows.length > 0) {
      // Stamp the aggregate-level `positionRoster` onto the primary
      // division row. Open-play events are single-division by invariant
      // (P1 #3); tournament/league divisions carry null.
      const primary = divisionRows[0] as Record<string, unknown>;
      primary.position_roster = event.positionRoster
        ? Object.fromEntries(event.positionRoster.entries())
        : null;
      const { error: upErr } = await this.client
        .from('event_divisions')
        .upsert(divisionRows as never, { onConflict: 'id' });
      if (upErr) throw new Error(`save divisions upsert failed: ${upErr.message}`);
      const keepIds = event.divisions.map((d) => String(d.id));
      const { error: delDivErr } = await this.client
        .from('event_divisions')
        .delete()
        .eq('event_id', eventIdStr)
        .not('id', 'in', `(${keepIds.join(',')})`);
      if (delDivErr) throw new Error(`save divisions delete failed: ${delDivErr.message}`);
    }

    // Drain raised events so callers don't double-handle them.
    event.pullEvents();
  }

  async search(query: EventSearchQuery): Promise<VolleyballEventSummary[]> {
    type DivisionJson = {
      id: string;
      label: string;
      surface: Surface;
      format: Format | null;
      gender: Gender | null;
      skillTier: SkillTier;
      tierLabel: string | null;
      ageGroup: AgeGroup;
      teamComposition: TeamComposition;
      priceCents: number | null;
      priceUnit: PriceUnit;
    };
    type SearchRow = {
      id: string;
      title: string;
      surface: Surface;
      format: Format | null;
      gender: Gender | null;
      skill_level: SkillLevel;
      type: EventType;
      starts_at: string;
      time_zone: string | null;
      city: string;
      region: string;
      spots_remaining: number | null;
      distance_km: number | null;
      series_name: string | null;
      series_position: number | null;
      series_size: number | null;
      is_fundraiser: boolean;
      registration_mode: RegistrationMode | null;
      divisions: DivisionJson[] | null;
    };

    const args = {
      p_lat: query.near?.latitude ?? null,
      p_lng: query.near?.longitude ?? null,
      p_radius_km: query.near?.radiusKm ?? null,
      p_surface: query.surface ?? null,
      p_format: query.format ?? null,
      p_gender: query.gender ?? null,
      p_skill_level: query.skillLevel ?? null,
      p_type: query.type ?? null,
      p_starts_after: query.startsAfter?.toISOString() ?? null,
      p_starts_before: query.startsBefore?.toISOString() ?? null,
      p_limit: query.limit ?? 20,
      p_skill_band: query.skillBand ?? null,
      p_age_group: query.ageGroup ?? null,
      p_team_composition: query.teamComposition ?? null,
      p_series_name: query.seriesName ?? null,
      p_registration_mode: query.registrationMode ?? null,
      p_is_fundraiser: query.isFundraiser ?? null,
    };

    const { data, error } = await this.client.rpc('search_events', args as never);
    if (error) throw new Error(`search failed: ${error.message}`);

    const rows = (data ?? []) as unknown as SearchRow[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      surface: r.surface,
      format: r.format,
      gender: r.gender,
      skillLevel: r.skill_level,
      type: r.type,
      startsAt: new Date(r.starts_at),
      timeZone: r.time_zone,
      city: r.city,
      region: r.region,
      spotsRemaining: r.spots_remaining,
      distanceKm: r.distance_km,
      seriesName: r.series_name,
      seriesPosition: r.series_position,
      seriesSize: r.series_size,
      isFundraiser: r.is_fundraiser,
      registrationMode: r.registration_mode ?? RegistrationMode.Platform,
      divisions: (r.divisions ?? []).map((d) => ({
        id: d.id,
        label: d.label,
        surface: d.surface,
        format: d.format,
        gender: d.gender,
        skillTier: d.skillTier,
        tierLabel: d.tierLabel,
        ageGroup: d.ageGroup,
        teamComposition: d.teamComposition,
        priceCents: d.priceCents,
        priceUnit: d.priceUnit,
      })),
    }));
  }

  // ----- Read-side: detail page -----------------------------------------

  /**
   * One conceptual call that returns everything the event detail page needs:
   * base event, hosts (primary user, primary group, co-hosts), attendees,
   * and viewer-specific bits (RSVP state, manage permission, friend ids,
   * hostable groups). Internally still N SQL roundtrips but the page
   * doesn't have to know.
   */
  /**
   * Lightweight, viewer-independent metadata for the bracket / schedule / watch
   * spectator pages (performance audit P3 #15). Two queries — the narrowed
   * `events_view` row + `event_divisions` — versus the ~14-query `getDetail`
   * read model. Runs on the admin client (no `cookies()`), so the result is
   * shareable across viewers and the calling pages stay cacheable. `canManage`
   * is intentionally omitted; those pages resolve manage rights client-side
   * (performance audit P2 #14).
   */
  async getBracketMeta(id: string): Promise<EventBracketMetaReadModel | null> {
    const [evRes, divisionRowsRes] = await Promise.all([
      this.client
        .from('events_view')
        .select('id, title, type, status, time_zone, host_id, host_group_id')
        .eq('id', id)
        .maybeSingle(),
      this.client
        .from('event_divisions')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true }),
    ]);
    if (evRes.error) throw new Error(`getBracketMeta(${id}) failed: ${evRes.error.message}`);
    const row = evRes.data as {
      id: string;
      title: string;
      type: EventType;
      status: EventStatus;
      time_zone: string | null;
      host_id: string | null;
      host_group_id: string | null;
    } | null;
    if (!row) return null;
    if (divisionRowsRes.error)
      throw new Error(`getBracketMeta(${id}) divisions failed: ${divisionRowsRes.error.message}`);
    const divisionRows = (divisionRowsRes.data as DivisionRow[] | null) ?? [];
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      status: row.status,
      timeZone: row.time_zone,
      hostUserId: row.host_id ?? null,
      hostGroupId: row.host_group_id ?? null,
      // The bracket / schedule / watch pages never read division winners, so we
      // skip the per-division winner-label lookups `getDetail` performs.
      divisions: divisionRows.map((d) => divisionRowToLite(d, null)),
    };
  }

  async getDetail(id: string, viewerId: string | null): Promise<EventDetailReadModel | null> {
    const { data: ev, error } = await this.client
      .from('events_view')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`getDetail(${id}) failed: ${error.message}`);
    if (!ev) return null;
    const row = ev as unknown as EventRow & { host_group_id: string | null };

    // Run independent queries in parallel.
    const [
      attendeeRowsRes,
      coHostRowsRes,
      primaryHostUserRes,
      primaryHostGroupRes,
      teamRowsRes,
      freeAgentRowsRes,
      divisionRowsRes,
    ] = await Promise.all([
      this.client
        .from('event_participants')
        .select(
          'user_id, joined_at, position, profiles:profiles!inner(handle, display_name, first_name, last_name, avatar_url), division:event_divisions!inner(event_id)',
        )
        .eq('role', 'attendee')
        .eq('division.event_id', id)
        .order('joined_at', { ascending: true }),
      this.client
        .from('event_co_hosts')
        .select(
          // `event_co_hosts` has TWO FKs to `profiles` (`host_user_id` and
          // `added_by`), so the embed MUST be disambiguated with the FK
          // hint — otherwise PostgREST returns PGRST201 ("more than one
          // relationship was found") and `data` comes back null. Without
          // the hint the code below silently treated every event as
          // having zero co-hosts, even when rows existed in the table.
          'host_user_id, host_group_id, profiles:profiles!host_user_id(id, handle, display_name, first_name, last_name, avatar_url), groups:groups(id, slug, name, avatar_url)',
        )
        .eq('event_id', id),
      row.host_id
        ? this.client
            .from('profiles')
            .select('id, handle, display_name, first_name, last_name, avatar_url')
            .eq('id', row.host_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      row.host_group_id
        ? this.client
            .from('groups')
            .select('id, slug, name, avatar_url')
            .eq('id', row.host_group_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.client
        .from('event_team_entries')
        .select(
          'team_id, division_id, registered_at, teams:teams!inner(id, slug, name, format, captain_id, captain:profiles!teams_captain_id_fkey(id, handle, display_name, first_name, last_name, avatar_url)), division:event_divisions!event_team_entries_division_id_fkey!inner(event_id)',
        )
        .eq('division.event_id', id)
        .eq('source', 'roster')
        .is('deleted_at', null)
        .order('registered_at', { ascending: true }),
      this.client
        .from('event_participants')
        .select(
          'user_id, notes, division_id, joined_at, profiles:profiles!inner(handle, display_name, first_name, last_name, avatar_url), division:event_divisions!inner(event_id)',
        )
        .eq('role', 'free_agent')
        .eq('division.event_id', id)
        .order('joined_at', { ascending: true }),
      this.client
        .from('event_divisions')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true }),
    ]);

    // The co-host embed needs a disambiguated FK hint (two FKs to `profiles`);
    // a missing hint returns PGRST201 with null data, which used to silently
    // drop every co-host. Surface the failure instead of swallowing it.
    if (coHostRowsRes.error) {
      throw new Error(`getDetail(${id}) co-host query failed: ${coHostRowsRes.error.message}`);
    }

    // Derive legacy display fields from primary division when the event
    // columns are null (ADR 0006 Phase 9b).
    const divisionRowsForDetail = (divisionRowsRes.data as DivisionRow[] | null) ?? [];
    const legacyDetail = primaryDivisionFallback(row, divisionRowsForDetail);

    // Resolve division winner labels (one extra read when any division has a
    // recorded winner). The mapper prefers the live `teams.name` over the
    // entry `display_name` (ad-hoc / walk-in rows). See `mapWinnerLabels`.
    let winnerLabelsByDivision = new Map<string, string>();
    const entryWinnerIds = divisionRowsForDetail
      .map((d) => d.winner_entry_id)
      .filter((v): v is string => !!v);
    if (entryWinnerIds.length > 0) {
      const { data: entryRows } = await this.client
        .from('event_team_entries')
        .select('id, display_name, team_id, teams:teams(name)')
        .in('id', entryWinnerIds);
      winnerLabelsByDivision = mapWinnerLabels(
        divisionRowsForDetail,
        (entryRows as WinnerEntryRow[] | null) ?? [],
      );
    }

    const positionRoster = divisionRowToPositionRoster(divisionRowsForDetail[0]);
    const { attendees, filledByPosition } = mapAttendees(
      (attendeeRowsRes.data as AttendeeRow[] | null) ?? [],
      positionRoster,
    );

    const { coHostUsers, coHostGroups, coGroupIds } = mapCoHosts(
      (coHostRowsRes.data as CoHostJoinRow[] | null) ?? [],
    );

    const teamJoinRows = (teamRowsRes.data as TeamJoinRow[] | null) ?? [];
    const registeredTeamIds = teamJoinRows.map((r) => r.teams?.id).filter((v): v is string => !!v);

    // ---- Wave 2: viewer-specific reads + team aggregates ----------------
    // These depend on Wave 1 (`registeredTeamIds`, `legacyDetail.format`), so
    // they form a second parallel batch.
    const [
      viewerFriendsRes,
      viewerRoleRes,
      viewerHostableGroupsRes,
      teamMemberCountsRes,
      teamPaymentsRes,
      viewerCaptainedTeamsRes,
    ] = await Promise.all([
      viewerId
        ? this.client.from('friendships').select('friend_id').eq('user_id', viewerId)
        : Promise.resolve({ data: [], error: null }),
      viewerId && row.host_group_id
        ? this.client
            .from('group_members')
            .select('role')
            .eq('group_id', row.host_group_id)
            .eq('user_id', viewerId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      viewerId
        ? this.client
            .from('group_members')
            .select('groups:groups!inner(id, name)')
            .eq('user_id', viewerId)
            .in('role', ['owner', 'admin'])
        : Promise.resolve({ data: [], error: null }),
      registeredTeamIds.length
        ? this.client.from('team_members').select('team_id').in('team_id', registeredTeamIds)
        : Promise.resolve({ data: [], error: null }),
      registeredTeamIds.length
        ? this.client
            .from('event_team_payments')
            .select(
              'team_id, payment_status, amount_paid_cents, division:event_divisions!inner(event_id)',
            )
            .eq('division.event_id', id)
            .in('team_id', registeredTeamIds)
        : Promise.resolve({ data: [], error: null }),
      // Teams the viewer captains in this event's format. Only meaningful
      // for tournaments; we still issue it for any logged-in viewer to
      // keep the response shape uniform — the cost is one tiny query.
      viewerId && legacyDetail.format
        ? this.client
            .from('teams')
            .select('id, name, format')
            .eq('captain_id', viewerId)
            .eq('format', legacyDetail.format)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const primaryHostUser = primaryHostUserRes.data
      ? toProfileLite(primaryHostUserRes.data as ProfileRow)
      : null;
    const primaryHostGroup = primaryHostGroupRes.data
      ? toGroupLite(primaryHostGroupRes.data as GroupRow)
      : null;

    const viewerFriendIds = ((viewerFriendsRes.data as { friend_id: string }[] | null) ?? []).map(
      (r) => r.friend_id,
    );
    const isAttending = !!viewerId && attendees.some((a) => a.userId === viewerId);

    const freeAgents = mapFreeAgents((freeAgentRowsRes.data as FreeAgentRow[] | null) ?? []);
    const isFreeAgent = !!viewerId && freeAgents.some((f) => f.userId === viewerId);

    let canManage = false;
    if (viewerId) {
      if (viewerId === row.host_id) canManage = true;
      else {
        const role = (viewerRoleRes.data as { role: string } | null)?.role;
        canManage = role === 'owner' || role === 'admin';
      }
    }

    const viewerHostableGroups = mapViewerHostableGroups(
      (viewerHostableGroupsRes.data as HostableGroupRow[] | null) ?? [],
      row.host_group_id,
      coGroupIds,
    );

    const teams = mapRegisteredTeams(
      teamJoinRows,
      tallyTeamMembers((teamMemberCountsRes.data as { team_id: string }[] | null) ?? []),
      indexPaymentsByTeam((teamPaymentsRes.data as TeamPaymentRow[] | null) ?? []),
    );

    // Viewer's captained teams need a member-count read of their own (the ids
    // aren't known until the Wave 2 captained-teams query resolves).
    const viewerTeamRows = (viewerCaptainedTeamsRes.data as ViewerTeamRow[] | null) ?? [];
    const viewerTeamIds = viewerTeamRows.map((t) => t.id);
    let viewerTeamMemberCounts = new Map<string, number>();
    if (viewerTeamIds.length) {
      const { data: vtm } = await this.client
        .from('team_members')
        .select('team_id')
        .in('team_id', viewerTeamIds);
      viewerTeamMemberCounts = tallyTeamMembers((vtm as { team_id: string }[] | null) ?? []);
    }
    const viewerCaptainedTeams = mapViewerCaptainedTeams(
      viewerTeamRows,
      viewerTeamMemberCounts,
      new Set(registeredTeamIds),
    );

    const spotsRemaining = computeSpotsRemaining(
      positionRoster,
      legacyDetail.capacity,
      row.attendee_count,
    );

    const positionRosterOut: Partial<Record<EventPosition, number>> | null = positionRoster
      ? (Object.fromEntries(positionRoster.entries()) as Partial<Record<EventPosition, number>>)
      : null;

    return {
      id: row.id,
      shortCode: row.short_code,
      title: row.title,
      description: row.description,
      rules: row.rules,
      surface: row.surface,
      format: legacyDetail.format,
      gender: legacyDetail.gender,
      skillLevel: legacyDetail.skillLevel,
      type: row.type,
      visibility: row.visibility,
      status: row.status,
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
      timeZone: row.time_zone,
      spotsRemaining,
      attendeeCount: row.attendee_count,
      positionRoster: positionRosterOut,
      filledByPosition: Object.fromEntries(filledByPosition) as Partial<
        Record<EventPosition, number>
      >,
      location: {
        addressLine: row.address_line,
        city: row.city,
        region: row.region,
        postalCode: row.postal_code,
        country: row.country,
        latitude: row.latitude,
        longitude: row.longitude,
      },
      hostUserId: row.host_id ?? null,
      hostGroupId: row.host_group_id,
      primaryHostUser,
      primaryHostGroup,
      coHostUsers,
      coHostGroups,
      attendees,
      teams,
      freeAgents,
      isAttending,
      isFreeAgent,
      canManage,
      viewerFriendIds,
      viewerHostableGroups,
      viewerCaptainedTeams,
      ...rowToExtensions(row),
      divisions: divisionRowsForDetail.map((d) =>
        divisionRowToLite(d, winnerLabelsByDivision.get(d.id) ?? null),
      ),
    };
  }

  async findIdByShortCode(shortCode: string): Promise<string | null> {
    const normalized = shortCode.trim().toUpperCase();
    if (normalized.length === 0) return null;
    const { data, error } = await this.client
      .from('events')
      .select('id')
      .eq('short_code', normalized)
      .maybeSingle();
    if (error) {
      throw new Error(`findIdByShortCode failed: ${error.message}`);
    }
    return (data as { id: string } | null)?.id ?? null;
  }

  // ----- Read-side: following feed --------------------------------------

  // Friend-graph reads (`getViewerFriends` / `searchFollowingFeed`) moved to
  // SupabaseSocialGraphRepository (architecture audit P2-2).

  // ----- Co-host management ---------------------------------------------

  async addCoHost(eventId: string, party: CoHostParty, addedBy: string): Promise<void> {
    const { error } = await this.client.from('event_co_hosts').insert({
      event_id: eventId,
      host_user_id: party.userId ?? null,
      host_group_id: party.groupId ?? null,
      added_by: addedBy,
    } as never);
    if (error) throw new Error(`addCoHost failed: ${error.message}`);
  }

  async removeCoHost(eventId: string, party: CoHostParty): Promise<void> {
    let q = this.client.from('event_co_hosts').delete().eq('event_id', eventId);
    if (party.userId) q = q.eq('host_user_id', party.userId);
    if (party.groupId) q = q.eq('host_group_id', party.groupId);
    const { error } = await q;
    if (error) throw new Error(`removeCoHost failed: ${error.message}`);
  }

  // ADR 0019: `attachTeamToDivision` and `attachFreeAgentToDivision` were
  // removed. The `VolleyballEvent` aggregate now carries the division on each
  // team / free-agent entry, so `save(event)` persists the join directly
  // (team inserts still route through the `attach_team_to_division` RPC from
  // inside `save`, preserving the partial-unique ON CONFLICT semantics).

  async setRosterTeamForfeited(
    divisionId: string,
    teamId: string,
    forfeitedAt: Date | null,
  ): Promise<void> {
    // Targets the live roster row only — `source='roster'` excludes ad-hoc
    // and walk-in entries (which don't have a captain to "forfeit") and
    // `deleted_at IS NULL` skips withdrawn rows. RLS on event_team_entries
    // gates the write to the event host.
    const { error } = await this.client
      .from('event_team_entries')
      .update({ forfeited_at: forfeitedAt ? forfeitedAt.toISOString() : null } as never)
      .eq('division_id', divisionId)
      .eq('team_id', teamId)
      .eq('source', 'roster')
      .is('deleted_at', null);
    if (error) throw new Error(`setRosterTeamForfeited failed: ${error.message}`);
  }
}
