import type { Match, EntryId } from './match.js';

/**
 * Per-team standings within a pool. Pure summary derived from completed
 * matches in that pool. Tied teams are ordered by:
 *   1. wins (desc)
 *   2. set differential (desc)
 *   3. point differential (desc)
 *
 * Head-to-head tiebreaker is intentionally omitted in v1 to keep the
 * logic predictable; teams above can break ties manually if needed.
 */
export interface PoolStanding {
  /**
   * Participant identity — points at `event_team_entries.id`. The field
   * keeps its legacy `teamId` name so existing UI lookups continue to
   * work; rename is a follow-up cleanup bundle.
   */
  readonly teamId: EntryId;
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

/** Standings for a single pool, sorted best-to-worst. */
export function computePoolStandings(matches: ReadonlyArray<Match>, pool: string): PoolStanding[] {
  const stats = new Map<
    string,
    {
      teamId: EntryId;
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
      teamId: id,
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
    teamId: s.teamId,
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

  out.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (y.setDiff !== x.setDiff) return y.setDiff - x.setDiff;
    return y.pointDiff - x.pointDiff;
  });
  return out;
}

/** All distinct pool labels found in the match list, sorted alphabetically. */
export function distinctPools(matches: ReadonlyArray<Match>): string[] {
  const set = new Set<string>();
  for (const m of matches) if (m.pool) set.add(m.pool);
  return Array.from(set).sort();
}
