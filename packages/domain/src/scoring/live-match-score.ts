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
  /** Points needed to win a set (e.g. 25 for volleyball, 11 for pickleball).
   *  The uniform fallback used when {@link targetScores} doesn't cover a set. */
  targetScore: number;
  /**
   * Per-set point targets (e.g. `[25, 25, 15]` for a best-of-3 where the
   * deciding set is played to 15). When present and non-empty it wins over the
   * uniform {@link targetScore}; a set past the array's end reuses the last
   * entry. Omitted entirely for a uniform match — see {@link targetForSet}.
   */
  targetScores?: ReadonlyArray<number>;
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

/**
 * The 1-indexed set currently being played: completed sets + 1. While a set is
 * in progress this is that set's number; right after the deciding `commitSet`
 * it points one past the last set (harmless — the match is already won).
 */
export function currentSetNumber(s: LiveMatchScore): number {
  return s.setsA + s.setsB + 1;
}

/**
 * Points needed to win set `setNumber` (1-indexed). When per-set
 * {@link LiveMatchConfig.targetScores} is present and non-empty it wins, with a
 * set past the array's end reusing the last entry (mirrors the bracket's
 * `effectiveSetTargetScore`); otherwise the uniform {@link LiveMatchConfig.targetScore}.
 */
export function targetForSet(config: LiveMatchConfig, setNumber: number): number {
  const arr = config.targetScores;
  if (arr && arr.length > 0) {
    const idx = Math.min(Math.max(setNumber, 1), arr.length) - 1;
    return arr[idx] ?? config.targetScore;
  }
  return config.targetScore;
}

export function matchWinner(s: LiveMatchScore): MatchSide | null {
  const need = setsToWin(s.config.bestOf);
  if (s.setsA >= need) return 'A';
  if (s.setsB >= need) return 'B';
  return null;
}

/**
 * True when the current set score satisfies its target + win-by for `side`.
 * The target is resolved for the set currently in play ({@link currentSetNumber}),
 * so per-set targets like `[25, 25, 15]` clinch the deciding set at 15.
 */
export function isSetWon(s: LiveMatchScore, side: MatchSide): boolean {
  const own = side === 'A' ? s.scoreA : s.scoreB;
  const opp = side === 'A' ? s.scoreB : s.scoreA;
  const target = targetForSet(s.config, currentSetNumber(s));
  return own >= target && own - opp >= s.config.winBy;
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

/**
 * Reverse the most recent {@link commitSet}: pop the last completed set, restore
 * the in-progress score to that set's final tally, and decrement the winning
 * side's set count. No-op when no set has been played.
 *
 * This is the "undo an accidental match-ending tap" recovery — after the
 * deciding "Win set", the scorer is dropped back inside that set at its final
 * score (e.g. 25–23) with the match no longer decided, free to shave a point and
 * re-commit. The winning side is inferred from the stored set score: the
 * scoreboard only ever commits the set-point side, which by definition leads
 * (a strict win-by margin rules out a tie), so `a > b` ⇒ side A won the set.
 */
export function undoLastSet(s: LiveMatchScore, now: number = Date.now()): LiveMatchScore {
  const last = s.setHistory[s.setHistory.length - 1];
  if (!last) return s;
  const wonByA = last.a > last.b;
  return {
    ...s,
    setsA: wonByA ? Math.max(0, s.setsA - 1) : s.setsA,
    setsB: wonByA ? s.setsB : Math.max(0, s.setsB - 1),
    setHistory: s.setHistory.slice(0, -1),
    scoreA: last.a,
    scoreB: last.b,
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
