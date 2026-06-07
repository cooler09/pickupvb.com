import type { EntryId } from '../brackets/match.js';
import { LeagueMatchStatus } from './league-schedule.js';

/**
 * The minimal shape {@link computeLeagueStandings} reads off a league match.
 * Both the {@link LeagueScheduleMatch} aggregate entity and a row-derived view
 * model satisfy it structurally, so the table can be computed from rehydrated
 * domain matches *or* straight from loaded schedule rows without rehydration
 * (the season-hub page computes it in-memory from already-loaded matches).
 */
export interface LeagueMatchResult {
  readonly homeEntryId: EntryId | null;
  readonly awayEntryId: EntryId | null;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly status: LeagueMatchStatus;
}

/**
 * One entry's regular-season record. Unlike {@link PoolStanding}, league
 * matches carry a single `home_score`/`away_score` per match (no set-by-set
 * rows — see `league_schedule_matches`), so there is no set tally; the score
 * is whatever the host records — sets won (e.g. 2–1) or rally points
 * (e.g. 25–20) — and feeds only the differential tiebreaker.
 */
export interface LeagueStanding {
  /** Participant identity — points at `event_team_entries.id` (ADR 0034). */
  readonly entryId: EntryId;
  readonly matchesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly pointDiff: number;
}

/**
 * Regular-season standings for a single league division, sorted best-to-worst.
 * Pure summary derived from the division's schedule. Tied entries are ordered
 * by:
 *   1. wins (desc)
 *   2. point differential (desc)
 *
 * Pass one division's slate (the repository loads matches per division); the
 * function does not filter by division itself. Every entry that appears in any
 * match shows up in the table — entries with no terminal result yet carry
 * zeroed stats so the full league is visible from the first fixture. Only
 * `completed` and `forfeit` matches with both scores recorded are tallied;
 * `scheduled` / `in_progress` / `cancelled` register the teams but don't score.
 * Head-to-head tiebreaker is intentionally omitted in v1 (mirrors
 * {@link computePoolStandings}) — equal records can be broken manually.
 */
export function computeLeagueStandings(
  matches: ReadonlyArray<LeagueMatchResult>,
): LeagueStanding[] {
  const stats = new Map<
    string,
    {
      entryId: EntryId;
      matchesPlayed: number;
      wins: number;
      losses: number;
      pointsFor: number;
      pointsAgainst: number;
    }
  >();

  function ensure(id: EntryId) {
    const key = String(id);
    const existing = stats.get(key);
    if (existing) return existing;
    const fresh = {
      entryId: id,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    };
    stats.set(key, fresh);
    return fresh;
  }

  for (const m of matches) {
    const { homeEntryId, awayEntryId, homeScore, awayScore, status } = m;
    // Register every participant so a team with only future fixtures still
    // appears in the table with zeros.
    if (homeEntryId) ensure(homeEntryId);
    if (awayEntryId) ensure(awayEntryId);

    if (status !== LeagueMatchStatus.Completed && status !== LeagueMatchStatus.Forfeit) continue;
    if (homeEntryId == null || awayEntryId == null) continue;
    if (homeScore == null || awayScore == null) continue;

    const home = ensure(homeEntryId);
    const away = ensure(awayEntryId);
    home.matchesPlayed += 1;
    away.matchesPlayed += 1;
    home.pointsFor += homeScore;
    home.pointsAgainst += awayScore;
    away.pointsFor += awayScore;
    away.pointsAgainst += homeScore;
    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (awayScore > homeScore) {
      away.wins += 1;
      home.losses += 1;
    }
    // Equal scores: counted as played, no win awarded. Volleyball shouldn't
    // tie, but the schema doesn't forbid it, so fail safe rather than guess.
  }

  const out: LeagueStanding[] = Array.from(stats.values()).map((s) => ({
    entryId: s.entryId,
    matchesPlayed: s.matchesPlayed,
    wins: s.wins,
    losses: s.losses,
    pointsFor: s.pointsFor,
    pointsAgainst: s.pointsAgainst,
    pointDiff: s.pointsFor - s.pointsAgainst,
  }));

  out.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    return y.pointDiff - x.pointDiff;
  });
  return out;
}
