import type { LiveMatchScore, MatchSet } from '@pickupvb/domain';

/**
 * Finalize mapping — translate a terminal {@link LiveMatchScore} (the scoreboard
 * value object) into the shapes the existing canonical match-result commands
 * expect, so saving from the scoreboard reuses the unchanged
 * `RecordMatchResultCommand` (bracket) / `RecordLeagueMatchResultCommand`
 * (league) handlers — winner advancement, header completion, and standings come
 * for free. See ADR 0023 §4.
 *
 * Side A of the scoreboard is the home / first-listed team; side B is the away /
 * second team. The scorer surface (Phase 4) seeds the board with side A = home,
 * so this orientation is fixed by construction.
 *
 * Pure: no I/O, no aggregate loading. The web finalize action calls these, hands
 * the result to the canonical handler, then clears the live row.
 */

/**
 * Bracket: the set-by-set scores. Completed sets come from `setHistory`; the
 * current set is appended only if it has any points — covering both "save after
 * the deciding `commitSet`" (current is 0–0) and "save mid-set" (host clicks
 * save before committing the last set).
 */
export function liveMatchScoreToMatchSets(s: LiveMatchScore): MatchSet[] {
  const sets: MatchSet[] = s.setHistory.map((h, i) => ({
    setNumber: i + 1,
    teamAScore: h.a,
    teamBScore: h.b,
  }));
  if (s.scoreA > 0 || s.scoreB > 0) {
    sets.push({ setNumber: sets.length + 1, teamAScore: s.scoreA, teamBScore: s.scoreB });
  }
  return sets;
}

/**
 * League: the single home/away pair the schedule stores (ADR 0023, resolved
 * 2026-05-30 — adaptive on `config.bestOf`):
 *
 * - **best-of-1** → the single set's points (e.g. 25–21). Uses the committed
 *   set if present, else the current in-progress score.
 * - **multi-set** → sets won (e.g. 2–1).
 */
export function liveMatchScoreToLeagueScore(s: LiveMatchScore): { home: number; away: number } {
  if (s.config.bestOf <= 1) {
    const set = s.setHistory[0] ?? { a: s.scoreA, b: s.scoreB };
    return { home: set.a, away: set.b };
  }
  return { home: s.setsA, away: s.setsB };
}
