import {
  LeagueMatchStatus,
  LeagueSchedule,
  LeagueScheduleMatch,
  NotFoundError,
  UnauthorizedError,
  type DivisionId,
  type EntryId,
  type EventWindow,
  type LeagueScheduleMatchId,
  type LeagueScheduleRepository,
  type RecordLeagueMatchResultInput,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type MatchRow = {
  id: string;
  division_id: string;
  week_number: number;
  scheduled_at: string;
  court_label: string | null;
  home_entry_id: string | null;
  away_entry_id: string | null;
  home_score: number | null;
  away_score: number | null;
  status: LeagueMatchStatus;
  notes: string | null;
};

type WindowRow = {
  event_id: string;
  events: { starts_at: string; ends_at: string } | null;
};

const MATCH_COLUMNS =
  'id, division_id, week_number, scheduled_at, court_label, home_entry_id, away_entry_id, home_score, away_score, status, notes';

export class SupabaseLeagueScheduleRepository implements LeagueScheduleRepository {
  private _client: SupabaseClient | null;

  /**
   * @param client Optional Supabase client. The composition root's
   *   module-singleton instance omits it and lazily builds the service-role
   *   admin client for host-gated writes. The captain-reachable
   *   `recordMatchResult` path constructs a per-request instance with a
   *   *user-scoped* client so the `league_schedule_matches_update` RLS
   *   policy (host or either captain) is actually enforced.
   */
  constructor(client?: SupabaseClient) {
    this._client = client ?? null;
  }

  private get client(): SupabaseClient {
    if (!this._client) this._client = createSupabaseAdminClient();
    return this._client;
  }

  nextMatchId(): LeagueScheduleMatchId {
    return globalThis.crypto.randomUUID() as LeagueScheduleMatchId;
  }

  async findByDivisionId(divisionId: DivisionId): Promise<LeagueSchedule | null> {
    const windowRes = await this.client
      .from('event_divisions')
      .select('event_id, events:events!inner(starts_at, ends_at)')
      .eq('id', divisionId)
      .maybeSingle();
    if (windowRes.error)
      throw new Error(`league schedule window load failed: ${windowRes.error.message}`);
    const windowRow = windowRes.data as unknown as WindowRow | null;
    if (!windowRow?.events) return null;
    const window: EventWindow = {
      startsAt: new Date(windowRow.events.starts_at),
      endsAt: new Date(windowRow.events.ends_at),
    };

    const matchesRes = await this.client
      .from('league_schedule_matches')
      .select(MATCH_COLUMNS)
      .eq('division_id', divisionId)
      .order('week_number', { ascending: true })
      .order('scheduled_at', { ascending: true });
    if (matchesRes.error)
      throw new Error(`league schedule load failed: ${matchesRes.error.message}`);
    const rows = (matchesRes.data ?? []) as unknown as MatchRow[];
    const matches = rows.map((r) =>
      LeagueScheduleMatch.create({
        id: r.id as LeagueScheduleMatchId,
        weekNumber: r.week_number,
        scheduledAt: new Date(r.scheduled_at),
        courtLabel: r.court_label,
        homeEntryId: r.home_entry_id ? (r.home_entry_id as EntryId) : null,
        awayEntryId: r.away_entry_id ? (r.away_entry_id as EntryId) : null,
        homeScore: r.home_score,
        awayScore: r.away_score,
        status: r.status,
        notes: r.notes,
      }),
    );

    return LeagueSchedule.fromPersistence(divisionId, window, matches);
  }

  async save(schedule: LeagueSchedule): Promise<void> {
    // Full-replace strategy mirrors SupabaseBracketRepository.save — the
    // aggregate owns the entire match list. The delete + insert pair is
    // wrapped in a single SECURITY INVOKER RPC
    // (`save_league_schedule`, migration 20260812000000) so PostgREST
    // runs both as one transaction; a failed insert rolls back the
    // delete instead of leaving the division with a partial slate.
    const matches = schedule.matches.map((m) => ({
      id: m.id,
      week_number: m.weekNumber,
      scheduled_at: m.scheduledAt.toISOString(),
      court_label: m.courtLabel,
      home_entry_id: m.homeEntryId,
      away_entry_id: m.awayEntryId,
      home_score: m.homeScore,
      away_score: m.awayScore,
      status: m.status,
      notes: m.notes,
    }));
    const { error } = await this.client.rpc('save_league_schedule', {
      p_division_id: schedule.divisionId,
      p_matches: matches,
    } as never);
    if (error) throw new Error(`league schedule save failed: ${error.message}`);
  }

  async recordMatchResult(input: RecordLeagueMatchResultInput): Promise<void> {
    // Narrow, single-row UPDATE via `record_league_match_result`
    // (migration 20260814000000) — a SECURITY INVOKER RPC, so the
    // `league_schedule_matches_update` RLS policy (host or either captain)
    // is the authorization gate. Must be invoked through a user-scoped
    // client (the module-singleton admin client would bypass RLS and
    // re-open the captain-auth gap). The RPC raises insufficient_privilege
    // (42501) when the caller is neither host nor captain and no_data_found
    // (P0002) when the match is unknown.
    const { error } = await this.client.rpc('record_league_match_result', {
      p_match_id: input.matchId,
      p_home_score: input.homeScore,
      p_away_score: input.awayScore,
      p_status: input.status,
    } as never);
    if (error) {
      if (error.code === '42501') {
        throw new UnauthorizedError('You can only record results for matches you host or captain.');
      }
      if (error.code === 'P0002') {
        throw new NotFoundError('LeagueScheduleMatch', String(input.matchId));
      }
      throw new Error(`league match result save failed: ${error.message}`);
    }
  }
}
