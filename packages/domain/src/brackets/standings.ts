import type { Match, EntryId } from './match.js';
import { ValidationError } from '../shared/result.js';

/**
 * How a pool's standings are ordered (ADR 0040):
 *  - `match_wins` (default): match wins (desc) → set diff (desc) → point diff
 *    (desc). The right ranking for `best_of` pools, where every match yields a
 *    winner.
 *  - `games_won`: total games won (desc) → point diff (desc). The ranking for
 *    `total_games` pools, where matches can finish tied (1-1) so match-win
 *    count is a poor signal — seeding is decided by games won and then points.
 */
export type StandingsRankBy = 'match_wins' | 'games_won';

/**
 * Per-team standings within a pool. Pure summary derived from completed
 * matches in that pool. Ordering depends on {@link StandingsRankBy} — see
 * that type. Head-to-head tiebreaker is intentionally omitted in v1 to keep
 * the logic predictable; teams above can break ties manually if needed.
 */
export interface PoolStanding {
  /** Participant identity — points at `event_team_entries.id`. */
  readonly entryId: EntryId;
  readonly matchesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly setsWon: number;
  readonly setsLost: number;
  readonly setDiff: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly pointDiff: number;
}

/** Standings for a single pool, sorted best-to-worst per `rankBy`. */
export function computePoolStandings(
  matches: ReadonlyArray<Match>,
  pool: string,
  rankBy: StandingsRankBy = 'match_wins',
): PoolStanding[] {
  const stats = new Map<
    string,
    {
      entryId: EntryId;
      wins: number;
      losses: number;
      setsWon: number;
      setsLost: number;
      pointsFor: number;
      pointsAgainst: number;
      matchesPlayed: number;
    }
  >();

  function ensure(id: EntryId) {
    const key = String(id);
    const existing = stats.get(key);
    if (existing) return existing;
    const fresh = {
      entryId: id,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      matchesPlayed: 0,
    };
    stats.set(key, fresh);
    return fresh;
  }

  for (const m of matches) {
    if (m.pool !== pool) continue;
    if (m.status !== 'completed') {
      // Still register the team so it appears in standings with zeros.
      if (m.entryAId) ensure(m.entryAId);
      if (m.entryBId) ensure(m.entryBId);
      continue;
    }
    if (!m.entryAId || !m.entryBId) continue;
    const a = ensure(m.entryAId);
    const b = ensure(m.entryBId);
    a.matchesPlayed += 1;
    b.matchesPlayed += 1;
    for (const s of m.sets) {
      a.pointsFor += s.teamAScore;
      a.pointsAgainst += s.teamBScore;
      b.pointsFor += s.teamBScore;
      b.pointsAgainst += s.teamAScore;
      if (s.teamAScore > s.teamBScore) {
        a.setsWon += 1;
        b.setsLost += 1;
      } else if (s.teamBScore > s.teamAScore) {
        b.setsWon += 1;
        a.setsLost += 1;
      }
    }
    if (m.winnerEntryId === m.entryAId) {
      a.wins += 1;
      b.losses += 1;
    } else if (m.winnerEntryId === m.entryBId) {
      b.wins += 1;
      a.losses += 1;
    }
  }

  const out: PoolStanding[] = Array.from(stats.values()).map((s) => ({
    entryId: s.entryId,
    matchesPlayed: s.matchesPlayed,
    wins: s.wins,
    losses: s.losses,
    setsWon: s.setsWon,
    setsLost: s.setsLost,
    setDiff: s.setsWon - s.setsLost,
    pointsFor: s.pointsFor,
    pointsAgainst: s.pointsAgainst,
    pointDiff: s.pointsFor - s.pointsAgainst,
  }));

  if (rankBy === 'games_won') {
    // Ties (1-1) are common, so match wins is a poor signal — rank by total
    // games won, then point differential (ADR 0040).
    out.sort((x, y) => {
      if (y.setsWon !== x.setsWon) return y.setsWon - x.setsWon;
      return y.pointDiff - x.pointDiff;
    });
  } else {
    out.sort((x, y) => {
      if (y.wins !== x.wins) return y.wins - x.wins;
      if (y.setDiff !== x.setDiff) return y.setDiff - x.setDiff;
      return y.pointDiff - x.pointDiff;
    });
  }
  return out;
}

/** All distinct pool labels found in the match list, sorted alphabetically. */
export function distinctPools(matches: ReadonlyArray<Match>): string[] {
  const set = new Set<string>();
  for (const m of matches) if (m.pool) set.add(m.pool);
  return Array.from(set).sort();
}

/**
 * Cross-pool playoff seeding (ADR 0032). Takes the per-pool standings (each
 * already sorted best-to-worst by {@link computePoolStandings}) and the
 * number advancing per pool, and returns a flat, overall seed order for
 * {@link generatePlayoffFromRanked}:
 *
 *  - **Position tier first** — every pool winner outranks every runner-up,
 *    which keeps two teams from the same pool off the same half in round 1
 *    and lands the top seeds on opposite sides of the bracket.
 *  - **Within a tier, by record** — win rate (fair across *uneven* pools),
 *    then set differential, then point differential — so the strongest pool
 *    winner is the #1 overall seed.
 *
 * The host can override the result with `seedPlayoff()`.
 *
 * @throws {ValidationError} if `advancePerPool` < 1 or any pool has fewer
 *   than `advancePerPool` finishers.
 */
export function rankAcrossPools(
  standingsByPool: ReadonlyArray<ReadonlyArray<PoolStanding>>,
  advancePerPool: number,
  rankBy: StandingsRankBy = 'match_wins',
): EntryId[] {
  if (advancePerPool < 1) {
    throw new ValidationError('Must advance at least 1 per pool.', { advancePerPool });
  }
  type Ranked = {
    entryId: EntryId;
    position: number;
    winPct: number;
    setDiff: number;
    pointDiff: number;
  };
  const ranked: Ranked[] = [];
  for (const standings of standingsByPool) {
    for (let pos = 0; pos < advancePerPool; pos++) {
      const s = standings[pos];
      if (!s) {
        throw new ValidationError(
          `Pool standings missing position ${pos + 1}; ` +
            `each pool must have at least ${advancePerPool} teams.`,
          { advancePerPool, missingPosition: pos + 1 },
        );
      }
      // For `games_won` pools (ties common) the same-position cross-pool
      // tiebreak is games-won rate, not match-win rate — mirrors how the
      // within-pool order was decided.
      const totalGames = s.setsWon + s.setsLost;
      const rate =
        rankBy === 'games_won'
          ? totalGames > 0
            ? s.setsWon / totalGames
            : 0
          : s.matchesPlayed > 0
            ? s.wins / s.matchesPlayed
            : 0;
      ranked.push({
        entryId: s.entryId,
        position: pos,
        winPct: rate,
        setDiff: s.setDiff,
        pointDiff: s.pointDiff,
      });
    }
  }
  ranked.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    if (b.setDiff !== a.setDiff) return b.setDiff - a.setDiff;
    return b.pointDiff - a.pointDiff;
  });
  return ranked.map((r) => r.entryId);
}
