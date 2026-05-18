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
  type EventId,
  type Match,
  type MatchId,
  type MatchSet,
  type MatchStatus,
  type Seed,
  type TeamId,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type BracketRow = {
  id: string;
  event_id: string;
  division_id: string;
  format: BracketFormat;
  config: Partial<BracketConfig> | null;
  status: BracketStatus;
};

type SeedRow = {
  bracket_id: string;
  team_id: string;
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
      .from('tournament_brackets')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`bracket findById failed: ${error.message}`);
    if (!data) return null;
    return this.hydrate(data as unknown as BracketRow);
  }

  async findByDivisionId(divisionId: DivisionId): Promise<Bracket | null> {
    const { data, error } = await this.client
      .from('tournament_brackets')
      .select('*')
      .eq('division_id', divisionId)
      .maybeSingle();
    if (error) throw new Error(`bracket findByDivisionId failed: ${error.message}`);
    if (!data) return null;
    return this.hydrate(data as unknown as BracketRow);
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
        .select('bracket_id, team_id, seed, pool')
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
    const matchRows = (matchesRes.data ?? []) as MatchRow[];

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
      teamId: s.team_id as TeamId,
      seed: s.seed,
      pool: s.pool,
    }));

    const matches: Match[] = matchRows.map((m) => ({
      id: m.id as MatchId,
      round: m.round,
      matchNumber: m.match_number,
      pool: m.pool,
      bracketSide: m.bracket_side,
      teamAId: m.team_a_id ? (m.team_a_id as TeamId) : null,
      teamBId: m.team_b_id ? (m.team_b_id as TeamId) : null,
      winnerTeamId: m.winner_team_id ? (m.winner_team_id as TeamId) : null,
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
    const { error: upErr } = await this.client.from('tournament_brackets').upsert(
      {
        id: bracket.id,
        event_id: bracket.eventId,
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
        team_id: s.teamId,
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
      team_a_id: m.teamAId,
      team_b_id: m.teamBId,
      winner_team_id: m.winnerTeamId,
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

  async listRegisteredTeams(eventId: EventId, divisionId: DivisionId): Promise<BracketTeamLite[]> {
    // Prefer division-scoped rows. Fall back to event-scoped rows for
    // legacy registrations whose `division_id` wasn't backfilled (should
    // be empty after ADR-0006 phase 6 backfill, but defensive here).
    const scoped = await this.client
      .from('event_teams')
      .select('team_id, teams:teams!inner(name, captain_id)')
      .eq('event_id', eventId)
      .eq('division_id', divisionId);
    if (scoped.error) {
      throw new Error(`listRegisteredTeams failed: ${scoped.error.message}`);
    }
    type Row = { team_id: string; teams: { name: string; captain_id: string } | null };
    const rows = (scoped.data as Row[] | null) ?? [];
    return rows
      .filter((r) => r.teams !== null)
      .map((r) => ({
        teamId: r.team_id,
        name: r.teams!.name,
        captainId: r.teams!.captain_id,
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
