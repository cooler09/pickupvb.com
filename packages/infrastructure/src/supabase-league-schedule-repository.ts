import {
  LeagueMatchStatus,
  LeagueSchedule,
  LeagueScheduleMatch,
  type DivisionId,
  type EventWindow,
  type LeagueScheduleMatchId,
  type LeagueScheduleRepository,
  type TeamId,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type MatchRow = {
  id: string;
  division_id: string;
  week_number: number;
  scheduled_at: string;
  court_label: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
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
  'id, division_id, week_number, scheduled_at, court_label, home_team_id, away_team_id, home_score, away_score, status, notes';

export class SupabaseLeagueScheduleRepository implements LeagueScheduleRepository {
  private _client: SupabaseClient | null = null;

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
        homeTeamId: r.home_team_id ? (r.home_team_id as TeamId) : null,
        awayTeamId: r.away_team_id ? (r.away_team_id as TeamId) : null,
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
      home_team_id: m.homeTeamId,
      away_team_id: m.awayTeamId,
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
}
