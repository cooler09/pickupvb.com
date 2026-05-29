import {
  Bracket,
  DEFAULT_BRACKET_CONFIG,
  type BracketConfig,
  type BracketFormat,
  type BracketId,
  type BracketRepository,
  type BracketSide,
  type BracketStatus,
  type BracketTeamLite,
  type DivisionId,
  type EntryId,
  type EventId,
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
  /** Derived via nested `event_divisions!inner(event_id)` join in the
   *  loaders below. The column was dropped from `event_brackets` in
   *  migration `20260729000000_drop_event_id_from_event_brackets_and_registrations.sql`. */
  event_id: string;
  division_id: string;
  format: BracketFormat;
  config: Partial<BracketConfig> | null;
  status: BracketStatus;
};

type BracketSelectRow = Omit<BracketRow, 'event_id'> & {
  event_divisions: { event_id: string };
};

const BRACKET_SELECT = 'id, division_id, format, config, status, event_divisions!inner(event_id)';

function flattenBracket(row: BracketSelectRow): BracketRow {
  return {
    id: row.id,
    event_id: row.event_divisions.event_id,
    division_id: row.division_id,
    format: row.format,
    config: row.config,
    status: row.status,
  };
}

type SeedRow = {
  bracket_id: string;
  team_id: string | null;
  entry_id: string | null;
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
  team_a_id: string | null;
  team_b_id: string | null;
  winner_team_id: string | null;
  work_team_id: string | null;
  entry_a_id: string | null;
  entry_b_id: string | null;
  winner_entry_id: string | null;
  work_entry_id: string | null;
  court: string | null;
  slot: number | null;
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
  private _client: SupabaseClient | null = null;

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
        .select('bracket_id, team_id, entry_id, seed, pool')
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
      // Prefer `entry_id` (post-cutover writes); fall back to legacy
      // `team_id` for rows the backfill missed. Either is treated as an
      // opaque `EntryId` downstream — UI lookups go through a dual-keyed
      // map (by both `teamId` and `entryId`) so a legacy value still
      // resolves.
      teamId: (s.entry_id ?? s.team_id) as EntryId,
      seed: s.seed,
      pool: s.pool,
    }));

    const matches: Match[] = matchRows.map((m) => ({
      id: m.id as MatchId,
      round: m.round,
      matchNumber: m.match_number,
      pool: m.pool,
      bracketSide: m.bracket_side,
      entryAId: (m.entry_a_id ?? m.team_a_id) as EntryId | null,
      entryBId: (m.entry_b_id ?? m.team_b_id) as EntryId | null,
      winnerEntryId: (m.winner_entry_id ?? m.winner_team_id) as EntryId | null,
      workTeamId: (m.work_entry_id ?? m.work_team_id) as EntryId | null,
      court: m.court,
      slot: m.slot,
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
      eventId: row.event_id as EventId,
      divisionId: row.division_id as DivisionId,
      format: row.format,
      config: { ...DEFAULT_BRACKET_CONFIG, ...(row.config ?? {}) },
      status: row.status,
      seeds,
      matches,
    });
  }

  async save(bracket: Bracket): Promise<void> {
    // Upsert the bracket row.
    const { error: upErr } = await this.client.from('event_brackets').upsert(
      {
        id: bracket.id,
        // event_id removed in Bundle A — derived from division on read.
        division_id: bracket.divisionId,
        format: bracket.format,
        config: bracket.config,
        status: bracket.status,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'id' },
    );
    if (upErr) throw new Error(`bracket upsert failed: ${upErr.message}`);

    // Reconcile seeds (delete + reinsert; small set, simple semantics).
    const { error: dsErr } = await this.client
      .from('bracket_seeds')
      .delete()
      .eq('bracket_id', bracket.id);
    if (dsErr) throw new Error(`bracket seed delete failed: ${dsErr.message}`);
    if (bracket.seeds.length > 0) {
      const seedRows = bracket.seeds.map((s) => ({
        bracket_id: bracket.id,
        entry_id: s.teamId,
        seed: s.seed,
        pool: s.pool,
      }));
      const { error: isErr } = await this.client.from('bracket_seeds').insert(seedRows as never);
      if (isErr) throw new Error(`bracket seed insert failed: ${isErr.message}`);
    }

    // Reconcile matches: full delete + reinsert without wiring, then a
    // second pass to attach `advances_to_*` (avoids forward-FK ordering).
    const { error: dmErr } = await this.client
      .from('bracket_matches')
      .delete()
      .eq('bracket_id', bracket.id);
    if (dmErr) throw new Error(`bracket match delete failed: ${dmErr.message}`);

    if (bracket.matches.length === 0) return;

    const matchRows = bracket.matches.map((m) => ({
      id: m.id,
      bracket_id: bracket.id,
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
      status: m.status,
      scheduled_at: m.scheduledAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    }));
    const { error: imErr } = await this.client.from('bracket_matches').insert(matchRows as never);
    if (imErr) throw new Error(`bracket match insert failed: ${imErr.message}`);

    // Wiring update (only matches that actually feed somewhere).
    const wired = bracket.matches.filter(
      (m) =>
        m.advancesToMatchId ||
        m.advancesToSlot ||
        m.loserAdvancesToMatchId ||
        m.loserAdvancesToSlot,
    );
    for (const m of wired) {
      const { error } = await this.client
        .from('bracket_matches')
        .update({
          advances_to_match_id: m.advancesToMatchId,
          advances_to_slot: m.advancesToSlot,
          loser_advances_to_match_id: m.loserAdvancesToMatchId,
          loser_advances_to_slot: m.loserAdvancesToSlot,
        } as never)
        .eq('id', m.id);
      if (error) throw new Error(`bracket match wire update failed: ${error.message}`);
    }

    // Insert sets.
    const setRows: SetRow[] = [];
    for (const m of bracket.matches) {
      for (const s of m.sets) {
        setRows.push({
          match_id: m.id,
          set_number: s.setNumber,
          team_a_score: s.teamAScore,
          team_b_score: s.teamBScore,
        });
      }
    }
    if (setRows.length > 0) {
      const { error: isetErr } = await this.client
        .from('bracket_match_sets')
        .insert(setRows as never);
      if (isetErr) throw new Error(`bracket sets insert failed: ${isetErr.message}`);
    }
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
