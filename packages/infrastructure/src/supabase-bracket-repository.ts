import {
  Bracket,
  DEFAULT_BRACKET_CONFIG,
  type BracketConfig,
  type BracketFormat,
  type BracketId,
  type BracketRepository,
  type BracketSide,
  type BracketStatus,
  type BracketSummary,
  type BracketTeamLite,
  type DivisionId,
  type EntryId,
  type EventId,
  NotFoundError,
  UnauthorizedError,
  UserId,
  type Match,
  type MatchId,
  type MatchSet,
  type MatchStatus,
  type Seed,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type BracketRow = {
  id: string;
  /** Derived via the nested `event_divisions(event_id)` join in the loaders
   *  below (the column was dropped from `event_brackets` in migration
   *  `20260729000000`). Null for standalone brackets (ADR 0025), which have no
   *  division — hence a LEFT join, not `!inner`. */
  event_id: string | null;
  division_id: string | null;
  owner_user_id: string | null;
  format: BracketFormat;
  config: Partial<BracketConfig> | null;
  status: BracketStatus;
};

type BracketSelectRow = Omit<BracketRow, 'event_id'> & {
  event_divisions: { event_id: string } | null;
};

// LEFT join on event_divisions (no `!inner`) so a standalone bracket
// (division_id NULL) survives the select; `event_divisions` is then null and
// the bracket carries `owner_user_id` instead. See ADR 0025.
const BRACKET_SELECT =
  'id, division_id, owner_user_id, format, config, status, event_divisions(event_id)';

function flattenBracket(row: BracketSelectRow): BracketRow {
  return {
    id: row.id,
    event_id: row.event_divisions?.event_id ?? null,
    division_id: row.division_id,
    owner_user_id: row.owner_user_id,
    format: row.format,
    config: row.config,
    status: row.status,
  };
}

type SeedRow = {
  bracket_id: string;
  entry_id: string;
  seed: number;
  pool: string | null;
};

type MatchRow = {
  id: string;
  bracket_id: string;
  round: number;
  match_number: number;
  pool: string | null;
  bracket_side: BracketSide | null;
  entry_a_id: string | null;
  entry_b_id: string | null;
  winner_entry_id: string | null;
  work_entry_id: string | null;
  court: string | null;
  slot: number | null;
  /** Per-match best-of / target-score overrides (ADR 0032; migration
   *  20260908000000). Null ⇒ stage / bracket default. */
  best_of: number | null;
  target_score: number | null;
  status: MatchStatus;
  advances_to_match_id: string | null;
  advances_to_slot: 'a' | 'b' | null;
  loser_advances_to_match_id: string | null;
  loser_advances_to_slot: 'a' | 'b' | null;
  scheduled_at: string | null;
};

type SetRow = {
  match_id: string;
  set_number: number;
  team_a_score: number;
  team_b_score: number;
};

export class SupabaseBracketRepository implements BracketRepository {
  private _client: SupabaseClient | null;

  /**
   * @param client Optional Supabase client. The composition root's
   *   module-singleton instance omits it and lazily builds the service-role
   *   admin client used by the host-gated operations (create / seed /
   *   generate / reset / reorder). The captain-reachable
   *   {@link saveAsMatchActor} path constructs a per-request instance with a
   *   *user-scoped* client so the authorization-gated
   *   `record_bracket_match_result` RPC sees the real `auth.uid()`.
   */
  constructor(client?: SupabaseClient) {
    this._client = client ?? null;
  }

  private get client(): SupabaseClient {
    if (!this._client) this._client = createSupabaseAdminClient();
    return this._client;
  }

  nextMatchId(): MatchId {
    return globalThis.crypto.randomUUID() as MatchId;
  }

  nextBracketId(): BracketId {
    return globalThis.crypto.randomUUID() as BracketId;
  }

  async findById(id: BracketId): Promise<Bracket | null> {
    const { data, error } = await this.client
      .from('event_brackets')
      .select(BRACKET_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`bracket findById failed: ${error.message}`);
    if (!data) return null;
    return this.hydrate(flattenBracket(data as unknown as BracketSelectRow));
  }

  async findByDivisionId(divisionId: DivisionId): Promise<Bracket | null> {
    const { data, error } = await this.client
      .from('event_brackets')
      .select(BRACKET_SELECT)
      .eq('division_id', divisionId)
      .maybeSingle();
    if (error) throw new Error(`bracket findByDivisionId failed: ${error.message}`);
    if (!data) return null;
    return this.hydrate(flattenBracket(data as unknown as BracketSelectRow));
  }

  async findByMatchId(matchId: MatchId): Promise<Bracket | null> {
    const { data, error } = await this.client
      .from('bracket_matches')
      .select('bracket_id')
      .eq('id', matchId)
      .maybeSingle();
    if (error) throw new Error(`bracket findByMatchId failed: ${error.message}`);
    const row = data as { bracket_id: string } | null;
    if (!row) return null;
    return this.findById(row.bracket_id as BracketId);
  }

  private async hydrate(row: BracketRow): Promise<Bracket> {
    const [seedsRes, matchesRes] = await Promise.all([
      this.client
        .from('bracket_seeds')
        .select('bracket_id, entry_id, seed, pool')
        .eq('bracket_id', row.id)
        .order('seed', { ascending: true }),
      this.client
        .from('bracket_matches')
        .select('*')
        .eq('bracket_id', row.id)
        .order('round', { ascending: true })
        .order('match_number', { ascending: true }),
    ]);
    if (seedsRes.error) throw new Error(`bracket seeds load failed: ${seedsRes.error.message}`);
    if (matchesRes.error)
      throw new Error(`bracket matches load failed: ${matchesRes.error.message}`);

    const seedRows = (seedsRes.data ?? []) as SeedRow[];
    const matchRows = (matchesRes.data ?? []) as unknown as MatchRow[];

    let setsByMatch = new Map<string, MatchSet[]>();
    if (matchRows.length > 0) {
      const matchIds = matchRows.map((m) => m.id);
      const setsRes = await this.client
        .from('bracket_match_sets')
        .select('match_id, set_number, team_a_score, team_b_score')
        .in('match_id', matchIds)
        .order('set_number', { ascending: true });
      if (setsRes.error) throw new Error(`bracket sets load failed: ${setsRes.error.message}`);
      setsByMatch = groupSets((setsRes.data ?? []) as SetRow[]);
    }

    const seeds: Seed[] = seedRows.map((s) => ({
      entryId: s.entry_id as EntryId,
      seed: s.seed,
      pool: s.pool,
    }));

    const matches: Match[] = matchRows.map((m) => ({
      id: m.id as MatchId,
      round: m.round,
      matchNumber: m.match_number,
      pool: m.pool,
      bracketSide: m.bracket_side,
      entryAId: m.entry_a_id as EntryId | null,
      entryBId: m.entry_b_id as EntryId | null,
      winnerEntryId: m.winner_entry_id as EntryId | null,
      workTeamId: m.work_entry_id as EntryId | null,
      court: m.court,
      slot: m.slot,
      bestOf: m.best_of ?? null,
      targetScore: m.target_score ?? null,
      status: m.status,
      sets: setsByMatch.get(m.id) ?? [],
      advancesToMatchId: m.advances_to_match_id ? (m.advances_to_match_id as MatchId) : null,
      advancesToSlot: m.advances_to_slot,
      loserAdvancesToMatchId: m.loser_advances_to_match_id
        ? (m.loser_advances_to_match_id as MatchId)
        : null,
      loserAdvancesToSlot: m.loser_advances_to_slot,
      scheduledAt: m.scheduled_at ? new Date(m.scheduled_at) : null,
    }));

    return Bracket.fromPersistence({
      id: row.id as BracketId,
      eventId: row.event_id ? (row.event_id as EventId) : null,
      divisionId: row.division_id ? (row.division_id as DivisionId) : null,
      ownerUserId: row.owner_user_id ? UserId(row.owner_user_id) : null,
      format: row.format,
      config: { ...DEFAULT_BRACKET_CONFIG, ...(row.config ?? {}) },
      status: row.status,
      seeds,
      matches,
    });
  }

  async save(bracket: Bracket): Promise<void> {
    // Full-replace via a single `save_bracket` SECURITY INVOKER RPC
    // (migration 20260813000100). PostgREST runs the function body in
    // one transaction so a failed insert anywhere in the seed/match/set
    // chain rolls back the entire upsert — replaces the prior pattern
    // of independent .upsert / .delete / .insert / .update calls that
    // could leave the bracket in a partial state on transient failure.
    //
    // Forward references between matches (e.g. `advances_to_match_id`
    // pointing at a sibling match in the same batch) resolve because
    // Postgres checks the self-FK at statement boundary; the RPC
    // inserts every match in a single `INSERT … SELECT` so the prior
    // two-pass wiring update is gone.
    if (bracket.ownerUserId) {
      // Standalone bracket (ADR 0025): `save_bracket`'s INSERT path can't
      // create the header — it doesn't write `owner_user_id`, so a
      // null-division / null-owner row would fail the scope XOR check. Upsert
      // the owner-scoped header first; `save_bracket` then finds the existing
      // row (its conflict-update leaves scope untouched) and only reconciles
      // seeds / matches / sets.
      const { error: headerErr } = await this.client.from('event_brackets').upsert(
        {
          id: bracket.id,
          owner_user_id: bracket.ownerUserId,
          format: bracket.format,
          config: bracket.config as never,
          status: bracket.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      if (headerErr) {
        throw new Error(`standalone bracket header save failed: ${headerErr.message}`);
      }
    }
    const { error } = await this.client.rpc('save_bracket', this.buildSaveArgs(bracket) as never);
    if (error) throw new Error(`bracket save failed: ${error.message}`);
  }

  async saveAsMatchActor(bracket: Bracket, actorMatchId: MatchId): Promise<void> {
    // Captain-reachable persist for recording / clearing a single match's
    // result. Routes the same domain-computed full-replace payload through
    // `record_bracket_match_result` (migration 20260814000100) instead of
    // `save_bracket` directly. That RPC authorizes the write against the
    // *actor* match — `is_event_host(event)` OR
    // `is_bracket_match_captain(actor_match_id)` — before delegating to
    // `save_bracket`. Must be invoked through a user-scoped client so the
    // RPC sees the real `auth.uid()`; the admin client would make the host
    // check pass for nobody and bypass the gate entirely. The RPC raises
    // insufficient_privilege (42501) when unauthorized and no_data_found
    // (P0002) when the actor match is unknown.
    const { error } = await this.client.rpc('record_bracket_match_result', {
      p_actor_match_id: actorMatchId,
      ...this.buildSaveArgs(bracket),
    } as never);
    if (error) {
      if (error.code === '42501') {
        throw new UnauthorizedError('You can only record results for matches you host or captain.');
      }
      if (error.code === 'P0002') {
        throw new NotFoundError('match', String(actorMatchId));
      }
      throw new Error(`bracket match result save failed: ${error.message}`);
    }
  }

  /** Shared `save_bracket` argument shape for {@link save} and
   *  {@link saveAsMatchActor}. */
  private buildSaveArgs(bracket: Bracket): {
    p_bracket_id: string;
    p_division_id: string | null;
    p_format: BracketFormat;
    p_config: BracketConfig;
    p_status: BracketStatus;
    p_seeds: Array<{ entry_id: string; seed: number; pool: string | null }>;
    p_matches: Array<Record<string, unknown>>;
    p_match_sets: SetRow[];
  } {
    const seeds = bracket.seeds.map((s) => ({
      entry_id: s.entryId,
      seed: s.seed,
      pool: s.pool,
    }));
    const matches = bracket.matches.map((m) => ({
      id: m.id,
      round: m.round,
      match_number: m.matchNumber,
      pool: m.pool,
      bracket_side: m.bracketSide,
      entry_a_id: m.entryAId,
      entry_b_id: m.entryBId,
      winner_entry_id: m.winnerEntryId,
      work_entry_id: m.workTeamId,
      court: m.court,
      slot: m.slot,
      best_of: m.bestOf,
      target_score: m.targetScore,
      status: m.status,
      scheduled_at: m.scheduledAt?.toISOString() ?? null,
      advances_to_match_id: m.advancesToMatchId,
      advances_to_slot: m.advancesToSlot,
      loser_advances_to_match_id: m.loserAdvancesToMatchId,
      loser_advances_to_slot: m.loserAdvancesToSlot,
    }));
    const matchSets: SetRow[] = [];
    for (const m of bracket.matches) {
      for (const s of m.sets) {
        matchSets.push({
          match_id: m.id,
          set_number: s.setNumber,
          team_a_score: s.teamAScore,
          team_b_score: s.teamBScore,
        });
      }
    }
    return {
      p_bracket_id: bracket.id,
      p_division_id: bracket.divisionId,
      p_format: bracket.format,
      p_config: bracket.config,
      p_status: bracket.status,
      p_seeds: seeds,
      p_matches: matches,
      p_match_sets: matchSets,
    };
  }

  async listRegisteredTeams(_eventId: EventId, divisionId: DivisionId): Promise<BracketTeamLite[]> {
    // Source `name` and `captain_id` straight from `event_team_entries`
    // — the entry row carries both fields directly for every source
    // (roster / ad_hoc / walk_in), so the prior `teams!inner` join
    // (which had to be filtered to roster-only entries via
    // `team_id IS NOT NULL`) is no longer needed. `team_id` itself
    // is preserved on the projection because the league schedule
    // surface still writes into `league_schedule_matches.home_team_id`
    // / `away_team_id` (FK → `teams.id`); roster-only consumers
    // continue to filter on the non-null teamId at their boundary.
    // Closes the bracket-reader filter-loosening follow-up from
    // docs/audits/event-data-model.md (the read half — write paths
    // already cut over to `entry_*_id` in the 2026-12-04 sweep).
    const scoped = await this.client
      .from('event_team_entries')
      .select('id, team_id, captain_id, display_name, forfeited_at')
      .eq('division_id', divisionId)
      .is('deleted_at', null);
    if (scoped.error) {
      throw new Error(`listRegisteredTeams failed: ${scoped.error.message}`);
    }
    type Row = {
      id: string;
      team_id: string | null;
      captain_id: string | null;
      display_name: string;
      forfeited_at: string | null;
    };
    const rows = (scoped.data as Row[] | null) ?? [];
    return rows.map((r) => ({
      teamId: r.team_id,
      entryId: r.id,
      name: r.display_name,
      captainId: r.captain_id,
      forfeitedAt: r.forfeited_at ? new Date(r.forfeited_at) : null,
    }));
  }

  // ---- Standalone brackets (ADR 0025) -------------------------------------

  async listByOwner(ownerUserId: UserId): Promise<ReadonlyArray<BracketSummary>> {
    const { data, error } = await this.client
      .from('event_brackets')
      .select('id, format, status, created_at, bracket_teams(count)')
      .eq('owner_user_id', ownerUserId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`listByOwner failed: ${error.message}`);
    type Row = {
      id: string;
      format: BracketFormat;
      status: BracketStatus;
      created_at: string;
      bracket_teams: { count: number }[] | null;
    };
    const rows = (data as unknown as Row[] | null) ?? [];
    return rows.map((r) => ({
      id: r.id,
      format: r.format,
      status: r.status,
      teamCount: r.bracket_teams?.[0]?.count ?? 0,
      createdAt: new Date(r.created_at),
    }));
  }

  async listStandaloneTeams(bracketId: BracketId): Promise<BracketTeamLite[]> {
    // Typed-in competitors live in `bracket_teams` (no roster / captain
    // account), shaped like BracketTeamLite so the seeding + board UI reuse
    // is unchanged. teamId / captainId / forfeitedAt are always null.
    const { data, error } = await this.client
      .from('bracket_teams')
      .select('id, name, created_at')
      .eq('bracket_id', bracketId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`listStandaloneTeams failed: ${error.message}`);
    const rows = (data as Array<{ id: string; name: string }> | null) ?? [];
    return rows.map((r) => ({
      teamId: null,
      entryId: r.id,
      name: r.name,
      captainId: null,
      forfeitedAt: null,
    }));
  }

  async addBracketTeam(bracketId: BracketId, name: string): Promise<{ entryId: string }> {
    const { data, error } = await this.client
      .from('bracket_teams')
      .insert({ bracket_id: bracketId, name })
      .select('id')
      .single();
    if (error) throw new Error(`addBracketTeam failed: ${error.message}`);
    return { entryId: (data as { id: string }).id };
  }

  async addBracketTeams(
    bracketId: BracketId,
    names: ReadonlyArray<string>,
  ): Promise<Array<{ entryId: string; name: string }>> {
    if (names.length === 0) return [];
    const { data, error } = await this.client
      .from('bracket_teams')
      .insert(names.map((name) => ({ bracket_id: bracketId, name })))
      .select('id, name');
    if (error) throw new Error(`addBracketTeams failed: ${error.message}`);
    const rows = (data as Array<{ id: string; name: string }> | null) ?? [];
    return rows.map((r) => ({ entryId: r.id, name: r.name }));
  }

  async deleteBracket(bracketId: BracketId): Promise<void> {
    // One DELETE on the header; `bracket_seeds` / `bracket_matches`
    // (→ `bracket_match_sets`) / `bracket_teams` / `match_live_scores` all FK
    // into `event_brackets(id)` with `on delete cascade`, so the whole bracket
    // is reaped in one statement. Owner authorization is enforced in the
    // handler before we get here; this runs on the service-role admin client.
    const { error } = await this.client.from('event_brackets').delete().eq('id', bracketId);
    if (error) throw new Error(`deleteBracket failed: ${error.message}`);
  }
}

function groupSets(rows: SetRow[]): Map<string, MatchSet[]> {
  const map = new Map<string, MatchSet[]>();
  for (const r of rows) {
    const list = map.get(r.match_id);
    const set: MatchSet = {
      setNumber: r.set_number,
      teamAScore: r.team_a_score,
      teamBScore: r.team_b_score,
    };
    if (list) list.push(set);
    else map.set(r.match_id, [set]);
  }
  return map;
}
