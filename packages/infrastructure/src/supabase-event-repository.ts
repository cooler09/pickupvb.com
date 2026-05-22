import {
  AgeGroup,
  Capacity,
  Division,
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
  TeamRegistrationMode,
  Visibility,
  VolleyballEvent,
  isEventPosition,
  skillBandTiers,
  skillTierBand,
  type AttendeeLite,
  type CaptainedTeamLite,
  type CoHostParty,
  type DivisionLite,
  type EventDetailReadModel,
  type EventPosition,
  type EventRepository,
  type EventSearchQuery,
  type FollowingFeedFilters,
  type FollowingFeedItem,
  type FreeAgentLite,
  type FriendProfile,
  type GroupLite,
  type ProfileLite,
  type SkillBand,
  type TeamLite,
  type VolleyballEventSummary,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

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
  position_roster: Record<string, number> | null;
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
  team_registration_mode: TeamRegistrationMode | null;
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
  winner_team_id: string | null;
  winner_team_registration_id: string | null;
  winner_recorded_at: string | null;
};

function rowToCapacity(row: EventRow): Capacity | null {
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
    capacity: rowToCapacity(row) ?? (d ? divisionRowToCapacity(d) : null),
  };
}

function rowToPositionRoster(row: EventRow): Map<EventPosition, number> | null {
  const raw = row.position_roster;
  if (!raw || typeof raw !== 'object') return null;
  const out = new Map<EventPosition, number>();
  for (const [key, value] of Object.entries(raw)) {
    if (!isEventPosition(key)) continue;
    if (typeof value === 'number' && value > 0) out.set(key, value);
  }
  return out.size > 0 ? out : null;
}

function rosterToJson(
  roster: ReadonlyMap<EventPosition, number> | null,
): Record<string, number> | null {
  if (!roster) return null;
  const obj: Record<string, number> = {};
  for (const [k, v] of roster) obj[k] = v;
  return obj;
}

function divisionRowToCapacity(row: DivisionRow): Capacity | null {
  if (row.capacity_kind === 'unlimited') return Capacity.unlimited();
  if (row.capacity_kind === 'fixed' && row.max_spots !== null) return Capacity.fixed(row.max_spots);
  return null;
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
    capacity: divisionRowToCapacity(row),
    priceCents: row.price_cents,
    priceUnit: row.price_unit,
    prizeText: row.prize_text,
    prizePurseCents: row.prize_purse_cents,
    startsAt: row.starts_at ? new Date(row.starts_at) : null,
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
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
    teamRegistrationMode: row.team_registration_mode ?? null,
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
      this.client.from('event_attendees').select('user_id, position').eq('event_id', id),
      this.client.from('event_teams').select('team_id').eq('event_id', id),
      this.client.from('event_free_agents').select('user_id, notes').eq('event_id', id),
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
      format: legacy.format,
      gender: legacy.gender,
      skillLevel: legacy.skillLevel,
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
      teams: ((teams ?? []) as Array<{ team_id: string }>).map((t) => t.team_id as never),
      freeAgents: ((freeAgents ?? []) as Array<{ user_id: string; notes: string | null }>).map(
        (f) => [f.user_id as never, f.notes] as const,
      ),
      positionRoster: rowToPositionRoster(row),
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
      // capacity_kind, max_spots, position_roster) are no longer written here.
      // Authority lives on event_divisions; the position_roster moved to
      // division-scoped data in earlier phases.
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
      team_registration_mode: event.teamRegistrationMode,
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.client.from('events').upsert(row as never, { onConflict: 'id' });
    if (error) throw new Error(`save(${event.id}) failed: ${error.message}`);

    // Reconcile attendees by delta. The aggregate's `_attendees` Map carries
    // (userId, position) but NOT `division_id` — that's chosen at signup
    // time and stored on the DB row. A naive delete-all-then-reinsert
    // would clobber `division_id` on every save, which (since the
    // `team_registration_model` migration made `division_id` NOT NULL on
    // event_attendees / event_teams / event_free_agents) trips the
    // `fill_default_division_id` trigger and fails for any multi-division
    // event whenever an unrelated save happens (e.g. another player
    // joining triggers a re-save of the whole aggregate). So:
    //
    //   * Read the current rows.
    //   * Delete only rows no longer in the aggregate.
    //   * Insert only rows newly added — division_id stays null and the
    //     trigger fills it when the event has exactly one division;
    //     multi-division joins go through dedicated handlers that write
    //     event_attendees directly with the chosen division_id.
    //   * UPDATE rows whose position changed.
    const eventIdForChildren = String(event.id);
    const { data: existingAttendeeRows, error: selAErr } = await this.client
      .from('event_attendees')
      .select('user_id, position')
      .eq('event_id', eventIdForChildren);
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
      event_id: string;
      user_id: string;
      position: string | null;
    }> = [];
    const attendeesToUpdate: Array<{ user_id: string; position: string | null }> = [];
    for (const [userId, position] of desiredAttendees.entries()) {
      if (!existingAttendees.has(userId)) {
        attendeesToInsert.push({ event_id: eventIdForChildren, user_id: userId, position });
      } else if (existingAttendees.get(userId) !== position) {
        attendeesToUpdate.push({ user_id: userId, position });
      }
    }
    if (attendeesToDelete.length > 0) {
      const { error: delErr } = await this.client
        .from('event_attendees')
        .delete()
        .eq('event_id', eventIdForChildren)
        .in('user_id', attendeesToDelete);
      if (delErr) throw new Error(`save attendees delete failed: ${delErr.message}`);
    }
    if (attendeesToInsert.length > 0) {
      const { error: insErr } = await this.client
        .from('event_attendees')
        .insert(attendeesToInsert as never);
      if (insErr) throw new Error(`save attendees insert failed: ${insErr.message}`);
    }
    for (const row of attendeesToUpdate) {
      const { error: updErr } = await this.client
        .from('event_attendees')
        .update({ position: row.position } as never)
        .eq('event_id', eventIdForChildren)
        .eq('user_id', row.user_id);
      if (updErr) throw new Error(`save attendees update failed: ${updErr.message}`);
    }

    // Same delta pattern for event_teams. Aggregate's `_teams` Set has no
    // division_id, so we MUST avoid blowing away existing rows.
    const desiredTeams = new Set(Array.from(event.teams).map((t) => String(t)));
    const { data: existingTeamRows, error: selTErr } = await this.client
      .from('event_teams')
      .select('team_id')
      .eq('event_id', eventIdForChildren);
    if (selTErr) throw new Error(`save teams load failed: ${selTErr.message}`);
    const existingTeams = new Set(
      ((existingTeamRows as Array<{ team_id: string }> | null) ?? []).map((r) => r.team_id),
    );
    const teamsToDelete = Array.from(existingTeams).filter((t) => !desiredTeams.has(t));
    const teamsToInsert = Array.from(desiredTeams).filter((t) => !existingTeams.has(t));
    if (teamsToDelete.length > 0) {
      const { error: delTErr } = await this.client
        .from('event_teams')
        .delete()
        .eq('event_id', eventIdForChildren)
        .in('team_id', teamsToDelete);
      if (delTErr) throw new Error(`save teams delete failed: ${delTErr.message}`);
    }
    if (teamsToInsert.length > 0) {
      const { error: insTErr } = await this.client
        .from('event_teams')
        .insert(
          teamsToInsert.map((team_id) => ({ event_id: eventIdForChildren, team_id })) as never,
        );
      if (insTErr) throw new Error(`save teams insert failed: ${insTErr.message}`);
    }

    // Free agents — delta on membership + notes update.
    const { data: existingFaRows, error: selFErr } = await this.client
      .from('event_free_agents')
      .select('user_id, notes')
      .eq('event_id', eventIdForChildren);
    if (selFErr) throw new Error(`save free agents load failed: ${selFErr.message}`);
    const existingFa = new Map<string, string | null>(
      ((existingFaRows as Array<{ user_id: string; notes: string | null }> | null) ?? []).map(
        (r) => [r.user_id, r.notes],
      ),
    );
    const desiredFa = new Map<string, string | null>(
      Array.from(event.freeAgents.entries()).map(([u, notes]) => [String(u), notes]),
    );
    const faToDelete: string[] = [];
    for (const userId of existingFa.keys()) {
      if (!desiredFa.has(userId)) faToDelete.push(userId);
    }
    const faToInsert: Array<{ event_id: string; user_id: string; notes: string | null }> = [];
    const faToUpdate: Array<{ user_id: string; notes: string | null }> = [];
    for (const [userId, notes] of desiredFa.entries()) {
      if (!existingFa.has(userId)) {
        faToInsert.push({ event_id: eventIdForChildren, user_id: userId, notes });
      } else if (existingFa.get(userId) !== notes) {
        faToUpdate.push({ user_id: userId, notes });
      }
    }
    if (faToDelete.length > 0) {
      const { error: delFErr } = await this.client
        .from('event_free_agents')
        .delete()
        .eq('event_id', eventIdForChildren)
        .in('user_id', faToDelete);
      if (delFErr) throw new Error(`save free agents delete failed: ${delFErr.message}`);
    }
    if (faToInsert.length > 0) {
      const { error: insFErr } = await this.client
        .from('event_free_agents')
        .insert(faToInsert as never);
      if (insFErr) throw new Error(`save free agents insert failed: ${insFErr.message}`);
    }
    for (const row of faToUpdate) {
      const { error: updErr } = await this.client
        .from('event_free_agents')
        .update({ notes: row.notes } as never)
        .eq('event_id', eventIdForChildren)
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
        .from('event_attendees')
        .select(
          'user_id, joined_at, position, profiles:profiles!inner(handle, display_name, first_name, last_name, avatar_url)',
        )
        .eq('event_id', id)
        .order('joined_at', { ascending: true }),
      this.client.from('event_co_hosts').select('host_user_id, host_group_id').eq('event_id', id),
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
        .from('event_teams')
        .select('team_id, registered_at, teams:teams!inner(id, slug, name, format, captain_id)')
        .eq('event_id', id)
        .order('registered_at', { ascending: true }),
      this.client
        .from('event_free_agents')
        .select(
          'user_id, notes, joined_at, profiles:profiles!inner(handle, display_name, first_name, last_name, avatar_url)',
        )
        .eq('event_id', id)
        .order('joined_at', { ascending: true }),
      this.client
        .from('event_divisions')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true }),
    ]);

    // Derive legacy display fields from primary division when the event
    // columns are null (ADR 0006 Phase 9b).
    const divisionRowsForDetail = (divisionRowsRes.data as DivisionRow[] | null) ?? [];
    const legacyDetail = primaryDivisionFallback(row, divisionRowsForDetail);

    // Resolve winner labels per division. Each division stores at most one
    // of `winner_team_id` (roster mode -> teams.name) or
    // `winner_team_registration_id` (ad-hoc -> event_team_registrations.name).
    // We batch both lookups and build a single id → label map keyed by
    // division id for the DivisionLite mapping below.
    const winnerLabelsByDivision = new Map<string, string>();
    const teamWinnerIds = divisionRowsForDetail
      .map((d) => d.winner_team_id)
      .filter((v): v is string => !!v);
    const regWinnerIds = divisionRowsForDetail
      .map((d) => d.winner_team_registration_id)
      .filter((v): v is string => !!v);
    if (teamWinnerIds.length > 0) {
      const { data: teamRows } = await this.client
        .from('teams')
        .select('id, name')
        .in('id', teamWinnerIds);
      const byId = new Map<string, string>(
        ((teamRows as Array<{ id: string; name: string }> | null) ?? []).map((r) => [r.id, r.name]),
      );
      for (const d of divisionRowsForDetail) {
        if (d.winner_team_id) {
          const label = byId.get(d.winner_team_id);
          if (label) winnerLabelsByDivision.set(d.id, label);
        }
      }
    }
    if (regWinnerIds.length > 0) {
      const { data: regRows } = await this.client
        .from('event_team_registrations')
        .select('id, name')
        .in('id', regWinnerIds);
      const byId = new Map<string, string>(
        ((regRows as Array<{ id: string; name: string }> | null) ?? []).map((r) => [r.id, r.name]),
      );
      for (const d of divisionRowsForDetail) {
        if (d.winner_team_registration_id) {
          const label = byId.get(d.winner_team_registration_id);
          if (label) winnerLabelsByDivision.set(d.id, label);
        }
      }
    }

    type AttendeeRow = {
      user_id: string;
      joined_at: string;
      position: string | null;
      profiles: {
        handle: string;
        display_name: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
      } | null;
    };
    const attRows = (attendeeRowsRes.data as AttendeeRow[] | null) ?? [];
    const positionRoster = rowToPositionRoster(row);
    // Attendees arrive ordered by joined_at; mark waitlist when, in
    // chronological order, the per-position count exceeds the configured
    // roster value. Earliest signups keep their seat.
    const filledByPosition = new Map<EventPosition, number>();
    const attendees: AttendeeLite[] = attRows.map((a) => {
      const pos = isEventPosition(a.position) ? a.position : null;
      let waitlist = false;
      if (pos && positionRoster) {
        const target = positionRoster.get(pos) ?? 0;
        const next = (filledByPosition.get(pos) ?? 0) + 1;
        filledByPosition.set(pos, next);
        waitlist = next > target;
      }
      return {
        userId: a.user_id,
        joinedAt: new Date(a.joined_at),
        position: pos,
        waitlist,
        profile: {
          id: a.user_id,
          handle: a.profiles?.handle ?? a.user_id,
          displayName: a.profiles?.display_name ?? 'Player',
          firstName: a.profiles?.first_name ?? null,
          lastName: a.profiles?.last_name ?? null,
          avatarUrl: a.profiles?.avatar_url ?? null,
        },
      };
    });

    const coHostRows =
      (coHostRowsRes.data as
        | { host_user_id: string | null; host_group_id: string | null }[]
        | null) ?? [];
    const coUserIds = coHostRows.map((c) => c.host_user_id).filter((v): v is string => !!v);
    const coGroupIds = coHostRows.map((c) => c.host_group_id).filter((v): v is string => !!v);

    // Registered tournament teams. Captain id only here — we batch-fetch
    // captain profiles + roster sizes in the next parallel block.
    type TeamJoinRow = {
      team_id: string;
      teams: { id: string; slug: string; name: string; format: Format; captain_id: string } | null;
    };
    const teamJoinRows = (teamRowsRes.data as TeamJoinRow[] | null) ?? [];
    const registeredTeamIds = teamJoinRows.map((r) => r.teams?.id).filter((v): v is string => !!v);
    const registeredCaptainIds = teamJoinRows
      .map((r) => r.teams?.captain_id)
      .filter((v): v is string => !!v);

    // Co-host detail fetch + viewer-specific fetches in parallel.
    const [
      coHostUsersRes,
      coHostGroupsRes,
      viewerFriendsRes,
      viewerRoleRes,
      viewerHostableGroupsRes,
      teamCaptainsRes,
      teamMemberCountsRes,
      viewerCaptainedTeamsRes,
    ] = await Promise.all([
      coUserIds.length
        ? this.client
            .from('profiles')
            .select('id, handle, display_name, first_name, last_name, avatar_url')
            .in('id', coUserIds)
        : Promise.resolve({ data: [], error: null }),
      coGroupIds.length
        ? this.client.from('groups').select('id, slug, name, avatar_url').in('id', coGroupIds)
        : Promise.resolve({ data: [], error: null }),
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
      registeredCaptainIds.length
        ? this.client
            .from('profiles')
            .select('id, handle, display_name, first_name, last_name, avatar_url')
            .in('id', registeredCaptainIds)
        : Promise.resolve({ data: [], error: null }),
      registeredTeamIds.length
        ? this.client.from('team_members').select('team_id').in('team_id', registeredTeamIds)
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

    type ProfileRow = {
      id: string;
      handle: string;
      display_name: string;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
    };
    type GroupRow = { id: string; slug: string; name: string; avatar_url: string | null };
    const toProfile = (p: ProfileRow): ProfileLite => ({
      id: p.id,
      handle: p.handle,
      displayName: p.display_name,
      firstName: p.first_name,
      lastName: p.last_name,
      avatarUrl: p.avatar_url,
    });
    const toGroup = (g: GroupRow): GroupLite => ({
      id: g.id,
      slug: g.slug,
      name: g.name,
      avatarUrl: g.avatar_url,
    });

    const primaryHostUser = primaryHostUserRes.data
      ? toProfile(primaryHostUserRes.data as ProfileRow)
      : null;
    const primaryHostGroup = primaryHostGroupRes.data
      ? toGroup(primaryHostGroupRes.data as GroupRow)
      : null;
    const coHostUsers = ((coHostUsersRes.data as ProfileRow[] | null) ?? []).map(toProfile);
    const coHostGroups = ((coHostGroupsRes.data as GroupRow[] | null) ?? []).map(toGroup);

    const viewerFriendIds = ((viewerFriendsRes.data as { friend_id: string }[] | null) ?? []).map(
      (r) => r.friend_id,
    );

    const isAttending = !!viewerId && attendees.some((a) => a.userId === viewerId);

    // ---- Free agents -----------------------------------------------
    type FreeAgentRow = {
      user_id: string;
      notes: string | null;
      joined_at: string;
      profiles: {
        handle: string;
        display_name: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
      } | null;
    };
    const faRows = (freeAgentRowsRes.data as FreeAgentRow[] | null) ?? [];
    const freeAgents: FreeAgentLite[] = faRows.map((f) => ({
      userId: f.user_id,
      notes: f.notes,
      joinedAt: new Date(f.joined_at),
      profile: {
        id: f.user_id,
        handle: f.profiles?.handle ?? f.user_id,
        displayName: f.profiles?.display_name ?? 'Player',
        firstName: f.profiles?.first_name ?? null,
        lastName: f.profiles?.last_name ?? null,
        avatarUrl: f.profiles?.avatar_url ?? null,
      },
    }));
    const isFreeAgent = !!viewerId && freeAgents.some((f) => f.userId === viewerId);

    let canManage = false;
    if (viewerId) {
      if (viewerId === row.host_id) canManage = true;
      else {
        const role = (viewerRoleRes.data as { role: string } | null)?.role;
        canManage = role === 'owner' || role === 'admin';
      }
    }

    type HostableGroupRow = { groups: { id: string; name: string } | null };
    const viewerHostableGroups = ((viewerHostableGroupsRes.data as HostableGroupRow[] | null) ?? [])
      .map((r) => r.groups)
      .filter((g): g is { id: string; name: string } => g !== null)
      .filter((g) => g.id !== row.host_group_id && !coGroupIds.includes(g.id));

    // ---- Build registered-team list (TeamLite[]) --------------------
    const captainProfiles = new Map<string, ProfileLite>();
    for (const p of (teamCaptainsRes.data as ProfileRow[] | null) ?? []) {
      captainProfiles.set(p.id, toProfile(p));
    }
    const memberCounts = new Map<string, number>();
    for (const m of (teamMemberCountsRes.data as { team_id: string }[] | null) ?? []) {
      memberCounts.set(m.team_id, (memberCounts.get(m.team_id) ?? 0) + 1);
    }
    const teams: TeamLite[] = teamJoinRows
      .map((r) => r.teams)
      .filter(
        (t): t is { id: string; slug: string; name: string; format: Format; captain_id: string } =>
          !!t,
      )
      .map((t) => ({
        teamId: t.id,
        slug: t.slug,
        name: t.name,
        format: t.format,
        captainId: t.captain_id,
        captain: captainProfiles.get(t.captain_id) ?? null,
        memberCount: memberCounts.get(t.id) ?? 0,
      }));

    // ---- Build viewer's captained teams (CaptainedTeamLite[]) -------
    type ViewerTeamRow = { id: string; name: string; format: Format };
    const viewerTeamRows = (viewerCaptainedTeamsRes.data as ViewerTeamRow[] | null) ?? [];
    const viewerTeamIds = viewerTeamRows.map((t) => t.id);
    let viewerTeamMemberCounts = new Map<string, number>();
    if (viewerTeamIds.length) {
      const { data: vtm } = await this.client
        .from('team_members')
        .select('team_id')
        .in('team_id', viewerTeamIds);
      for (const m of (vtm as { team_id: string }[] | null) ?? []) {
        viewerTeamMemberCounts.set(m.team_id, (viewerTeamMemberCounts.get(m.team_id) ?? 0) + 1);
      }
    }
    const registeredTeamIdSet = new Set(registeredTeamIds);
    const viewerCaptainedTeams: CaptainedTeamLite[] = viewerTeamRows.map((t) => ({
      id: t.id,
      name: t.name,
      format: t.format,
      memberCount: viewerTeamMemberCounts.get(t.id) ?? 0,
      isRegistered: registeredTeamIdSet.has(t.id),
    }));

    const capacity = legacyDetail.capacity;
    const spotsRemaining = positionRoster
      ? Math.max(
          0,
          Array.from(positionRoster.values()).reduce((a, b) => a + b, 0) - row.attendee_count,
        )
      : !capacity
        ? null
        : capacity.kind === 'unlimited'
          ? null
          : Math.max(0, (capacity.maxSpots ?? 0) - row.attendee_count);

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

  async getViewerFriends(viewerId: string): Promise<FriendProfile[]> {
    const { data: rows, error } = await this.client
      .from('friendships')
      .select(
        'friend_id, profiles:profiles!friendships_friend_id_fkey(id, display_name, first_name, last_name)',
      )
      .eq('user_id', viewerId);
    if (error) throw new Error(`getViewerFriends failed: ${error.message}`);

    type Row = {
      friend_id: string;
      profiles: {
        id: string;
        display_name: string;
        first_name: string | null;
        last_name: string | null;
      } | null;
    };
    return ((rows as Row[] | null) ?? []).map((r) => {
      const p = r.profiles;
      const full = p ? [p.first_name, p.last_name].filter(Boolean).join(' ').trim() : '';
      return {
        id: r.friend_id,
        displayName: full || p?.display_name || 'Player',
      };
    });
  }

  async searchFollowingFeed(
    _viewerId: string,
    friendIds: ReadonlyArray<string>,
    filters: FollowingFeedFilters,
  ): Promise<FollowingFeedItem[]> {
    if (friendIds.length === 0) return [];

    // Find events where any friend is attending — used to build the OR
    // condition (host_id IN friends OR id IN friend-attended).
    const { data: aRows, error: aErr } = await this.client
      .from('event_attendees')
      .select('event_id, user_id')
      .in('user_id', friendIds as string[]);
    if (aErr) throw new Error(`searchFollowingFeed attendees failed: ${aErr.message}`);

    type AttRow = { event_id: string; user_id: string };
    const attRows = (aRows ?? []) as AttRow[];
    const attendingByEvent = new Map<string, string[]>();
    for (const r of attRows) {
      const arr = attendingByEvent.get(r.event_id) ?? [];
      arr.push(r.user_id);
      attendingByEvent.set(r.event_id, arr);
    }
    const attendeeEventIds = Array.from(attendingByEvent.keys());

    let q = this.client
      .from('events')
      .select('id, title, surface, type, starts_at, time_zone, city, region, host_id')
      .gte('starts_at', filters.startsAfter.toISOString())
      .order('starts_at', { ascending: true })
      .limit(filters.limit ?? 60);
    if (filters.surface) q = q.eq('surface', filters.surface);
    if (filters.type) q = q.eq('type', filters.type);

    // Skill filter now reads through event_divisions (ADR 0006 Phase 9c).
    // Resolve the requested level to its underlying tier set and restrict
    // to events that have a division matching one of those tiers.
    if (filters.skillLevel) {
      const tiers = skillBandTiers(filters.skillLevel as unknown as SkillBand);
      const { data: divRows, error: dErr } = await this.client
        .from('event_divisions')
        .select('event_id')
        .in(
          'skill_tier',
          tiers as unknown as readonly ('c' | 'b' | 'bb' | 'bb3' | 'a' | 'aa' | 'open')[],
        );
      if (dErr) throw new Error(`searchFollowingFeed divisions failed: ${dErr.message}`);
      const skillEventIds = Array.from(
        new Set(((divRows ?? []) as { event_id: string }[]).map((r) => r.event_id)),
      );
      if (skillEventIds.length === 0) return [];
      q = q.in('id', skillEventIds);
    }

    const orParts = [`host_id.in.(${friendIds.join(',')})`];
    if (attendeeEventIds.length > 0) {
      orParts.push(`id.in.(${attendeeEventIds.join(',')})`);
    }
    q = q.or(orParts.join(','));

    const { data: rows, error: eErr } = await q;
    if (eErr) throw new Error(`searchFollowingFeed events failed: ${eErr.message}`);

    type EvRow = {
      id: string;
      title: string;
      surface: Surface;
      type: EventType;
      starts_at: string;
      time_zone: string | null;
      city: string;
      region: string;
      host_id: string;
    };
    const evRows = (rows ?? []) as EvRow[];

    // Hydrate per-event skill from the primary (lowest sort_order) division.
    const eventIds = evRows.map((r) => r.id);
    const skillByEvent = new Map<string, SkillLevel>();
    if (eventIds.length > 0) {
      const { data: dRows, error: dErr } = await this.client
        .from('event_divisions')
        .select('event_id, skill_tier, sort_order')
        .in('event_id', eventIds)
        .order('sort_order', { ascending: true });
      if (dErr) throw new Error(`searchFollowingFeed skill hydrate failed: ${dErr.message}`);
      type DRow = { event_id: string; skill_tier: SkillTier; sort_order: number };
      for (const d of (dRows ?? []) as DRow[]) {
        if (!skillByEvent.has(d.event_id)) {
          skillByEvent.set(d.event_id, skillTierBand(d.skill_tier) as unknown as SkillLevel);
        }
      }
    }

    const friendIdSet = new Set(friendIds);
    return evRows.map((r) => {
      const hostFriendId = friendIdSet.has(r.host_id) ? r.host_id : null;
      const attendingFriendIds = (attendingByEvent.get(r.id) ?? []).filter(
        (uid) => uid !== r.host_id,
      );
      return {
        id: r.id,
        title: r.title,
        surface: r.surface,
        skillLevel: skillByEvent.get(r.id) ?? SkillLevel.Intermediate,
        type: r.type,
        startsAt: new Date(r.starts_at),
        timeZone: r.time_zone,
        city: r.city,
        region: r.region,
        hostFriendId,
        attendingFriendIds,
      };
    });
  }

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
}
