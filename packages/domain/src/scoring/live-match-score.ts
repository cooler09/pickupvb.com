/**
 * LiveMatchScore — the pure scoring rules for a rally-scored match
 * (volleyball, pickleball, badminton, …). Promoted out of the web scoreboard
 * tool (apps/web/.../tools/scoreboard/_lib/types.ts) per ADR 0023 §2 so the
 * rules can be shared between the free standalone scoreboard, the Pro
 * live-match surface, and the persisted `match_live_scores` state — and so they
 * finally get unit coverage.
 *
 * This is a value object: a plain serializable shape plus pure free functions
 * that return new states (never mutate). It is framework-free (no Next, no
 * Supabase, no DOM) and JSON-round-trippable, because the same shape travels
 * the realtime broadcast channel, `localStorage`, and (Phase 3) a `jsonb`
 * column. That rules out a class with methods — rehydrating from JSON would
 * lose them.
 *
 * `version` / `updatedAt` are an optimistic-concurrency token for last-write-
 * wins sync across peers: every mutation bumps `version`, and ties break on
 * the newer `updatedAt`. Mutators take `now` as a defaulted parameter so the
 * rules stay pure and testable; call sites that don't pass it get `Date.now()`
 * at call time (never in a React render body — see AGENTS.md pitfall #4).
 */

/**
 * Which side of the scoreboard scored — the left/right column, not a team
 * *identity*. Deliberately distinct from the branded `TeamId`
 * (`event_team_entries.id`) used by brackets and leagues.
 */
export type MatchSide = 'A' | 'B';

export interface LiveMatchConfig {
  teamA: string;
  teamB: string;
  /** Points needed to win a set (e.g. 25 for volleyball, 11 for pickleball). */
  targetScore: number;
  /** Must win by this many points (e.g. 2). */
  winBy: number;
  /** Best of N sets — first to ceil(N/2) sets wins the match. Use 1 for one-off games. */
  bestOf: number;
}

export interface LiveMatchScore {
  config: LiveMatchConfig;
  scoreA: number;
  scoreB: number;
  setsA: number;
  setsB: number;
  /** Completed set scores in order. */
  setHistory: ReadonlyArray<{ a: number; b: number }>;
  /** Monotonically-increasing version so late-joining peers can pick the freshest snapshot. */
  version: number;
  /** ms since epoch — for TTL cleanup and last-write-wins tie-breaks. */
  updatedAt: number;
}

export const DEFAULT_LIVE_MATCH_CONFIG: LiveMatchConfig = {
  teamA: 'Team A',
  teamB: 'Team B',
  targetScore: 25,
  winBy: 2,
  bestOf: 3,
};

export function createLiveMatchScore(
  config: LiveMatchConfig,
  now: number = Date.now(),
): LiveMatchScore {
  return {
    config,
    scoreA: 0,
    scoreB: 0,
    setsA: 0,
    setsB: 0,
    setHistory: [],
    version: 0,
    updatedAt: now,
  };
}

/** Sets required to win the match (e.g. bestOf=3 → 2). */
export function setsToWin(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

export function matchWinner(s: LiveMatchScore): MatchSide | null {
  const need = setsToWin(s.config.bestOf);
  if (s.setsA >= need) return 'A';
  if (s.setsB >= need) return 'B';
  return null;
}

/** True when the current set score satisfies target + win-by for `side`. */
export function isSetWon(s: LiveMatchScore, side: MatchSide): boolean {
  const own = side === 'A' ? s.scoreA : s.scoreB;
  const opp = side === 'A' ? s.scoreB : s.scoreA;
  return own >= s.config.targetScore && own - opp >= s.config.winBy;
}

export function increment(
  s: LiveMatchScore,
  side: MatchSide,
  delta: 1 | -1,
  now: number = Date.now(),
): LiveMatchScore {
  const next = { ...s };
  if (side === 'A') next.scoreA = Math.max(0, s.scoreA + delta);
  else next.scoreB = Math.max(0, s.scoreB + delta);
  next.version = s.version + 1;
  next.updatedAt = now;
  return next;
}

/** Commit the current set to the side's column and reset point scores. */
export function commitSet(
  s: LiveMatchScore,
  side: MatchSide,
  now: number = Date.now(),
): LiveMatchScore {
  return {
    ...s,
    setsA: side === 'A' ? s.setsA + 1 : s.setsA,
    setsB: side === 'B' ? s.setsB + 1 : s.setsB,
    setHistory: [...s.setHistory, { a: s.scoreA, b: s.scoreB }],
    scoreA: 0,
    scoreB: 0,
    version: s.version + 1,
    updatedAt: now,
  };
}

export function resetMatch(
  config: LiveMatchConfig,
  version: number,
  now: number = Date.now(),
): LiveMatchScore {
  return { ...createLiveMatchScore(config, now), version: version + 1 };
}

export function swapSides(s: LiveMatchScore, now: number = Date.now()): LiveMatchScore {
  return {
    ...s,
    config: { ...s.config, teamA: s.config.teamB, teamB: s.config.teamA },
    scoreA: s.scoreB,
    scoreB: s.scoreA,
    setsA: s.setsB,
    setsB: s.setsA,
    setHistory: s.setHistory.map((h) => ({ a: h.b, b: h.a })),
    version: s.version + 1,
    updatedAt: now,
  };
}
