import {
  AgeGroup,
  Capacity,
  Division,
  DivisionId,
  EventId,
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
  type EventSearchDivision,
  type EventSearchQuery,
  type VolleyballEventSummary,
} from '@pickupvb/domain';
import { createSupabaseAdminClient, type Database } from '@pickupvb/supabase';
import { asJson } from './supabase-json.js';
import {
  computeSpotsRemaining,
  indexPaymentsByTeam,
  mapAttendees,
  mapCoHosts,
  mapFreeAgents,
  mapRegisteredTeams,
  mapViewerCaptainedTeams,
  mapViewerHostableGroups,
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
  registration_close_offset_minutes: number | null;
  registration_override: 'open' | 'closed' | null;
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
  runner_up_entry_id: string | null;
  third_place_entry_id: string | null;
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
    id: DivisionId(row.id),
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

/** Map a `Division` aggregate to its `event_divisions` row shape (the
 *  `save_event` RPC's `p_divisions` element). */
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

function divisionRowToLite(
  row: DivisionRow,
  labels: { winner: string | null; runnerUp: string | null; third: string | null },
): DivisionLite {
  const winner =
    labels.winner !== null && row.winner_recorded_at !== null
      ? { label: labels.winner, recordedAt: new Date(row.winner_recorded_at) }
      : null;
  const runnerUp = labels.runnerUp !== null ? { label: labels.runnerUp } : null;
  const thirdPlace = labels.third !== null ? { label: labels.third } : null;
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
    runnerUp,
    thirdPlace,
  };
}

function rowToExtensions(row: EventRow) {
  return {
    venueName: row.venue_name,
    registrationClosesAt: row.registration_closes_at ? new Date(row.registration_closes_at) : null,
    registrationCloseOffsetMinutes: row.registration_close_offset_minutes ?? null,
    registrationOverride: row.registration_override ?? null,
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

  /** Client-injectable for tests (matches the sibling adapters). Production
   *  callers construct with no args and get the lazily-built admin client. */
  constructor(client?: SupabaseClient) {
    this._client = client ?? null;
  }

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
      { data: waitlist, error: wErr },
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
      // FIFO capacity waitlist, head-first (ADR 0036).
      this.client
        .from('event_waitlist')
        .select('user_id')
        .eq('event_id', id)
        .order('created_at', { ascending: true }),
    ]);
    if (aErr) throw new Error(`findById attendees failed: ${aErr.message}`);
    if (tErr) throw new Error(`findById teams failed: ${tErr.message}`);
    if (fErr) throw new Error(`findById free agents failed: ${fErr.message}`);
    if (dErr) throw new Error(`findById divisions failed: ${dErr.message}`);
    if (wErr) throw new Error(`findById waitlist failed: ${wErr.message}`);

    const divisionRows = (divisions ?? []) as DivisionRow[];
    const legacy = primaryDivisionFallback(row, divisionRows);

    return VolleyballEvent.fromPersistence({
      id: EventId(row.id),
      hostId: UserId(row.host_id),
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
        (a) => [UserId(a.user_id), isEventPosition(a.position) ? a.position : null] as const,
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
      waitlist: ((waitlist ?? []) as Array<{ user_id: string }>).map((w) => UserId(w.user_id)),
    });
  }

  async save(event: VolleyballEvent): Promise<void> {
    const loc = event.location;
    const wkt = `SRID=4326;POINT(${loc.longitude} ${loc.latitude})`;
    const eventId = String(event.id);

    // ADR 0006 Phase 9c: legacy event columns (format/gender/skill_level/
    // capacity_kind/max_spots) are not written here — authority is on
    // event_divisions; positionRoster lives on the primary division row
    // (stamped below). Columns NOT listed (host_group_id, host_absorbs_fee,
    // pass_processing_fee_to_buyer, refund_window_hours, hero_image_url) are
    // owned by other write paths and left untouched by save_event. short_code
    // is filled by the BEFORE INSERT trigger on create.
    const eventRow = {
      id: eventId,
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
      venue_name: event.venueName,
      registration_closes_at: event.registrationClosesAt
        ? event.registrationClosesAt.toISOString()
        : null,
      registration_close_offset_minutes: event.registrationCloseOffsetMinutes,
      registration_override: event.registrationOverride,
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

    const attendees = Array.from(event.attendees.entries()).map(([u, position]) => ({
      user_id: String(u),
      position,
    }));
    const waitlist = event.waitlist.map((u) => String(u));
    const teams = event.teamEntries.map(([t, d]) => ({
      team_id: String(t),
      division_id: d ? String(d) : null,
    }));
    const freeAgents = event.freeAgentEntries.map(([u, e]) => ({
      user_id: String(u),
      division_id: e.divisionId ? String(e.divisionId) : null,
      notes: e.notes,
    }));
    const divisionRows = event.divisions.map((d) => divisionToRow(eventId, d));
    if (divisionRows.length > 0) {
      // Stamp the aggregate-level positionRoster onto the primary division row.
      const primary = divisionRows[0] as Record<string, unknown>;
      primary.position_roster = event.positionRoster
        ? Object.fromEntries(event.positionRoster.entries())
        : null;
    }

    // Atomic full persist (architecture audit P2-2 inc. 3): the events row +
    // every child reconcile (attendees / waitlist / roster teams / free agents /
    // divisions) run in ONE transaction via the save_event RPC, replacing the
    // prior per-statement write sequence. The RPC performs the identical delta
    // semantics — see migration 20260919000000_save_event_rpc.sql.
    const { error } = await this.client.rpc('save_event', {
      p_event: asJson(eventRow),
      p_attendees: asJson(attendees),
      p_waitlist: asJson(waitlist),
      p_teams: asJson(teams),
      p_free_agents: asJson(freeAgents),
      p_divisions: asJson(divisionRows),
    });
    if (error) throw new Error(`save(${event.id}) failed: ${error.message}`);

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
      latitude: number | null;
      longitude: number | null;
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

    const { data, error } = await this.client.rpc(
      'search_events',
      args as Database['public']['Functions']['search_events']['Args'],
    );
    if (error) throw new Error(`search failed: ${error.message}`);

    const rows = (data ?? []) as unknown as SearchRow[];
    const heroByEvent = await this.loadHeroImageUrls(rows.map((r) => r.id));
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
      latitude: r.latitude,
      longitude: r.longitude,
      spotsRemaining: r.spots_remaining,
      distanceKm: r.distance_km,
      seriesName: r.series_name,
      seriesPosition: r.series_position,
      seriesSize: r.series_size,
      isFundraiser: r.is_fundraiser,
      registrationMode: r.registration_mode ?? RegistrationMode.Platform,
      heroImageUrl: heroByEvent.get(r.id) ?? null,
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

  /**
   * Hero image URLs for a set of event ids, read from `events_view` (the
   * `search_events` RPC doesn't project the column, and altering it would mean
   * a migration — a batched id lookup is cheaper and migration-free). Cosmetic:
   * on error we return an empty map so the cards fall back to their
   * surface-tinted placeholder rather than failing the whole search.
   */
  private async loadHeroImageUrls(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const { data, error } = await this.client
      .from('events_view')
      .select('id, hero_image_url')
      .in('id', ids);
    if (error) return map;
    for (const row of (data ?? []) as { id: string; hero_image_url: string | null }[]) {
      if (row.hero_image_url) map.set(row.id, row.hero_image_url);
    }
    return map;
  }

  async listAttending(
    userId: string,
    opts: { startsAfter?: Date; limit?: number } = {},
  ): Promise<VolleyballEventSummary[]> {
    // Events the user joined as an individual attendee. `event_participants` is
    // keyed by `division_id`; the event id comes through the division join.
    // Scoping to this user's own rows is the authorization here — RLS isn't
    // relied on (the static repo runs on the admin client).
    const { data: pRows, error: pErr } = await this.client
      .from('event_participants')
      .select('division:event_divisions!inner(event_id)')
      .eq('user_id', userId)
      .eq('role', 'attendee');
    if (pErr) throw new Error(`listAttending participants failed: ${pErr.message}`);
    type PRow = { division: { event_id: string } | null };
    const eventIds = Array.from(
      new Set(
        ((pRows ?? []) as unknown as PRow[])
          .map((r) => r.division?.event_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (eventIds.length === 0) return [];

    // Upcoming events among them, soonest first. `events_view` gives the
    // computed attendee_count (capacity badge) plus the scalar / series /
    // fundraiser fields. format/gender/skill_level live on divisions now
    // (ADR 0006 Phase 9c), so they're derived from the primary division below.
    let q = this.client
      .from('events_view')
      .select(
        'id, title, surface, type, starts_at, time_zone, city, region, attendee_count, hero_image_url, is_fundraiser, series_name, series_position, series_size, registration_mode',
      )
      .in('id', eventIds)
      .order('starts_at', { ascending: true });
    if (opts.startsAfter) {
      // Leagues are seasons: keep an in-progress league "upcoming" until its
      // season ends (`ends_at`), not the season start. Mirrors the
      // `search_events` RPC classification (migration 20260915000000).
      const iso = opts.startsAfter.toISOString();
      q = q.or(`and(type.neq.league,starts_at.gte.${iso}),and(type.eq.league,ends_at.gte.${iso})`);
    }
    if (opts.limit) q = q.limit(opts.limit);
    const { data: evData, error: evErr } = await q;
    if (evErr) throw new Error(`listAttending events failed: ${evErr.message}`);
    type EvRow = {
      id: string;
      title: string;
      surface: Surface;
      type: EventType;
      starts_at: string;
      time_zone: string | null;
      city: string;
      region: string;
      attendee_count: number | null;
      hero_image_url: string | null;
      is_fundraiser: boolean | null;
      series_name: string | null;
      series_position: number | null;
      series_size: number | null;
      registration_mode: RegistrationMode | null;
    };
    const evRows = (evData ?? []) as unknown as EvRow[];
    if (evRows.length === 0) return [];

    // Hydrate the full divisions array (price chip + division-list chips) and
    // the primary division (event-level format/gender/skill + capacity for the
    // "spots left" badge) the same way `search`'s RPC projects them — read in
    // JS to avoid altering the large `search_events` function (cf. F-13).
    const divisionsByEvent = new Map<string, EventSearchDivision[]>();
    const primaryByEvent = new Map<
      string,
      {
        format: Format | null;
        gender: Gender | null;
        skillTier: SkillTier;
        capacityKind: 'fixed' | 'unlimited' | null;
        maxSpots: number | null;
      }
    >();
    const { data: dRows, error: dErr } = await this.client
      .from('event_divisions')
      .select(
        'event_id, id, sort_order, label, surface, format, gender, skill_tier, tier_label, age_group, team_composition, capacity_kind, max_spots, price_cents, price_unit',
      )
      .in(
        'event_id',
        evRows.map((r) => r.id),
      )
      .order('sort_order', { ascending: true });
    if (dErr) throw new Error(`listAttending divisions failed: ${dErr.message}`);
    type DRow = {
      event_id: string;
      id: string;
      sort_order: number;
      label: string;
      surface: Surface;
      format: Format | null;
      gender: Gender | null;
      skill_tier: SkillTier;
      tier_label: string | null;
      age_group: AgeGroup;
      team_composition: TeamComposition;
      capacity_kind: 'fixed' | 'unlimited' | null;
      max_spots: number | null;
      price_cents: number | null;
      price_unit: PriceUnit;
    };
    for (const d of (dRows ?? []) as DRow[]) {
      const arr = divisionsByEvent.get(d.event_id) ?? [];
      arr.push({
        id: d.id,
        label: d.label,
        surface: d.surface,
        format: d.format,
        gender: d.gender,
        skillTier: d.skill_tier,
        tierLabel: d.tier_label,
        ageGroup: d.age_group,
        teamComposition: d.team_composition,
        priceCents: d.price_cents,
        priceUnit: d.price_unit,
      });
      divisionsByEvent.set(d.event_id, arr);
      if (!primaryByEvent.has(d.event_id)) {
        primaryByEvent.set(d.event_id, {
          format: d.format,
          gender: d.gender,
          skillTier: d.skill_tier,
          capacityKind: d.capacity_kind,
          maxSpots: d.max_spots,
        });
      }
    }

    return evRows.map((r) => {
      const primary = primaryByEvent.get(r.id);
      const spotsRemaining =
        primary && primary.capacityKind === 'fixed' && primary.maxSpots !== null
          ? primary.maxSpots - (r.attendee_count ?? 0)
          : null;
      return {
        id: r.id,
        title: r.title,
        surface: r.surface,
        format: primary?.format ?? null,
        gender: primary?.gender ?? null,
        skillLevel: primary
          ? (skillTierBand(primary.skillTier) as SkillLevel)
          : SkillLevel.Intermediate,
        type: r.type,
        startsAt: new Date(r.starts_at),
        timeZone: r.time_zone,
        city: r.city,
        region: r.region,
        // This list (profile attending/hosting) isn't mapped; like distanceKm,
        // it leaves the map-only coords null rather than widening the view select.
        latitude: null,
        longitude: null,
        spotsRemaining,
        distanceKm: null,
        seriesName: r.series_name,
        seriesPosition: r.series_position,
        seriesSize: r.series_size,
        isFundraiser: r.is_fundraiser ?? false,
        registrationMode: r.registration_mode ?? RegistrationMode.Platform,
        heroImageUrl: r.hero_image_url,
        divisions: divisionsByEvent.get(r.id) ?? [],
      };
    });
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
      // skip the per-division placement-label lookups `getDetail` performs.
      divisions: divisionRows.map((d) =>
        divisionRowToLite(d, { winner: null, runnerUp: null, third: null }),
      ),
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

    // Wave 1: the event's own child reads (attendees, co-hosts, primary host
    // user/group, roster teams, free agents, divisions), run in parallel — see
    // loadDetailWave1.
    const {
      attendeeRowsRes,
      coHostRowsRes,
      primaryHostUserRes,
      primaryHostGroupRes,
      teamRowsRes,
      freeAgentRowsRes,
      divisionRowsRes,
    } = await this.loadDetailWave1(id, row.host_id, row.host_group_id);

    // Derive legacy display fields from primary division when the event
    // columns are null (ADR 0006 Phase 9b).
    const divisionRowsForDetail = (divisionRowsRes.data as DivisionRow[] | null) ?? [];
    const legacyDetail = primaryDivisionFallback(row, divisionRowsForDetail);

    // Resolve podium labels (one extra read when any division has a recorded
    // placement) — see loadPodiumLabels.
    const entryLabelById = await this.loadPodiumLabels(divisionRowsForDetail);
    const placementLabels = (d: DivisionRow) => ({
      winner: d.winner_entry_id ? (entryLabelById.get(d.winner_entry_id) ?? null) : null,
      runnerUp: d.runner_up_entry_id ? (entryLabelById.get(d.runner_up_entry_id) ?? null) : null,
      third: d.third_place_entry_id ? (entryLabelById.get(d.third_place_entry_id) ?? null) : null,
    });

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

    // Wave 2: viewer-specific reads + team aggregates (depend on Wave 1's
    // registeredTeamIds) — see loadDetailWave2.
    const {
      viewerFriendsRes,
      viewerRoleRes,
      viewerHostableGroupsRes,
      teamMemberCountsRes,
      teamPaymentsRes,
      viewerCaptainedTeamsRes,
    } = await this.loadDetailWave2(id, viewerId, row.host_group_id, registeredTeamIds);

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
      if (viewerId === row.host_id) {
        canManage = true;
      } else {
        const role = (viewerRoleRes.data as { role: string } | null)?.role;
        const isHostGroupAdmin = role === 'owner' || role === 'admin';
        // Event co-hosts manage the event too — matches `is_event_host` (the SQL
        // gate the bracket / league / broadcast writes already use) + the
        // events_select RLS. canManage previously covered only host + host-group
        // admin, so an individual event co-host (`event_co_hosts.host_user_id`)
        // or a co-host group's admin was redirected away from /edit + /manage
        // despite being able to act everywhere else.
        const isEventCoHostUser = coHostUsers.some((u) => String(u.id) === viewerId);
        const viewerAdminGroupIds = new Set(
          ((viewerHostableGroupsRes.data as HostableGroupRow[] | null) ?? [])
            .map((r) => r.groups?.id)
            .filter((id): id is string => !!id),
        );
        const isCoHostGroupAdmin = coGroupIds.some((gid) => viewerAdminGroupIds.has(gid));
        canManage = isHostGroupAdmin || isEventCoHostUser || isCoHostGroupAdmin;
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
    // aren't known until the Wave 2 captained-teams query resolves) — see
    // loadViewerTeamMemberCounts.
    const viewerTeamRows = (viewerCaptainedTeamsRes.data as ViewerTeamRow[] | null) ?? [];
    const viewerTeamIds = viewerTeamRows.map((t) => t.id);
    const viewerTeamMemberCounts = await this.loadViewerTeamMemberCounts(viewerTeamIds);
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
      divisions: divisionRowsForDetail.map((d) => divisionRowToLite(d, placementLabels(d))),
    };
  }

  // ---- getDetail query waves (extracted I/O — architecture audit P2-2 inc. 2) ----
  //
  // The two parallel read waves + the conditional podium / viewer-team reads
  // live here so getDetail is a readable orchestrator (loaders → mappers →
  // assemble). Each returns the raw PostgREST result objects so the (separately
  // tested) parsing in getDetail/mappers.ts is unchanged. Verbatim queries —
  // pinned by the read-sequence characterization test.

  /** Wave 1: the event's own child reads, run in parallel. */
  private async loadDetailWave1(id: string, hostId: string | null, hostGroupId: string | null) {
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
      hostId
        ? this.client
            .from('profiles')
            .select('id, handle, display_name, first_name, last_name, avatar_url')
            .eq('id', hostId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      hostGroupId
        ? this.client
            .from('groups')
            .select('id, slug, name, avatar_url')
            .eq('id', hostGroupId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.client
        .from('event_team_entries')
        .select(
          'team_id, division_id, registered_at, teams:teams!inner(id, slug, name, captain_id, captain:profiles!teams_captain_id_fkey(id, handle, display_name, first_name, last_name, avatar_url)), division:event_divisions!event_team_entries_division_id_fkey!inner(event_id)',
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

    return {
      attendeeRowsRes,
      coHostRowsRes,
      primaryHostUserRes,
      primaryHostGroupRes,
      teamRowsRes,
      freeAgentRowsRes,
      divisionRowsRes,
    };
  }

  /** Podium labels: one extra read when any division has a recorded placement.
   *  Collect every placement entry id across all three places, fetch once, and
   *  build an entry-id → label map (preferring the live `teams.name` over the
   *  entry `display_name` for ad-hoc / walk-in rows). */
  private async loadPodiumLabels(divisionRows: DivisionRow[]): Promise<Map<string, string>> {
    const placementEntryIds = [
      ...new Set(
        divisionRows.flatMap((d) =>
          [d.winner_entry_id, d.runner_up_entry_id, d.third_place_entry_id].filter(
            (v): v is string => !!v,
          ),
        ),
      ),
    ];
    if (placementEntryIds.length === 0) return new Map();
    const { data: entryRows } = await this.client
      .from('event_team_entries')
      .select('id, display_name, team_id, teams:teams(name)')
      .in('id', placementEntryIds);
    return new Map(
      ((entryRows as WinnerEntryRow[] | null) ?? []).map((r) => [
        r.id,
        r.teams?.name ?? r.display_name,
      ]),
    );
  }

  /** Wave 2: viewer-specific reads + team aggregates (depend on Wave 1's
   *  `registeredTeamIds`), run in parallel. */
  private async loadDetailWave2(
    id: string,
    viewerId: string | null,
    hostGroupId: string | null,
    registeredTeamIds: string[],
  ) {
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
      viewerId && hostGroupId
        ? this.client
            .from('group_members')
            .select('role')
            .eq('group_id', hostGroupId)
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
      // Every team the viewer captains. Teams are not format-locked (ADR
      // 0013) — a roster can enter a division of any format — so we no longer
      // filter by the event's format; the picker shows all of them. Only
      // consumed by the tournament/league signup panels (harmless elsewhere).
      // One tiny query, issued for any logged-in viewer to keep the response
      // shape uniform.
      viewerId
        ? this.client.from('teams').select('id, name').eq('captain_id', viewerId)
        : Promise.resolve({ data: [], error: null }),
    ]);

    return {
      viewerFriendsRes,
      viewerRoleRes,
      viewerHostableGroupsRes,
      teamMemberCountsRes,
      teamPaymentsRes,
      viewerCaptainedTeamsRes,
    };
  }

  /** Member counts for the viewer's captained teams (ids known only after the
   *  Wave 2 captained-teams query resolves). */
  private async loadViewerTeamMemberCounts(teamIds: string[]): Promise<Map<string, number>> {
    if (teamIds.length === 0) return new Map();
    const { data: vtm } = await this.client
      .from('team_members')
      .select('team_id')
      .in('team_id', teamIds);
    return tallyTeamMembers((vtm as { team_id: string }[] | null) ?? []);
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
    });
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

  async setLeagueEntryForfeited(entryId: string, forfeitedAt: Date | null): Promise<void> {
    // Keyed on the entry id (ADR 0034), so it works for both rostered teams
    // and host-added (team-less `walk_in`) entries. `deleted_at IS NULL` skips
    // withdrawn rows. RLS on event_team_entries gates the write to the host.
    const { error } = await this.client
      .from('event_team_entries')
      .update({ forfeited_at: forfeitedAt ? forfeitedAt.toISOString() : null })
      .eq('id', entryId)
      .is('deleted_at', null);
    if (error) throw new Error(`setLeagueEntryForfeited failed: ${error.message}`);
  }
}
