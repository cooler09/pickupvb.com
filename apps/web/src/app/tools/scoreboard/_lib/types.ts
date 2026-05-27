/**
 * Scoreboard types — shared between setup, full-screen scoreboard, and
 * mobile remote controller.
 *
 * Intentionally framework-free (no Next, no Supabase). This is an
 * ephemeral utility — no domain aggregate, no DB persistence. If/when
 * we add Pro persistence (save results, attach to event_id), promote
 * these into packages/domain.
 */

export type TeamId = 'A' | 'B';

export type ScoreboardConfig = {
  teamA: string;
  teamB: string;
  /** Points needed to win a set (e.g. 25 for volleyball, 11 for pickleball). */
  targetScore: number;
  /** Must win by this many points (e.g. 2). */
  winBy: number;
  /** Best of N sets — first to ceil(N/2) sets wins the match. Use 1 for one-off games. */
  bestOf: number;
};

export type ScoreboardState = {
  config: ScoreboardConfig;
  scoreA: number;
  scoreB: number;
  setsA: number;
  setsB: number;
  /** Completed set scores in order. */
  setHistory: Array<{ a: number; b: number }>;
  /** Monotonically-increasing version so late-joining peers can pick the freshest snapshot. */
  version: number;
  /** ms since epoch — for TTL cleanup of localStorage entries. */
  updatedAt: number;
};

export const DEFAULT_CONFIG: ScoreboardConfig = {
  teamA: 'Team A',
  teamB: 'Team B',
  targetScore: 25,
  winBy: 2,
  bestOf: 3,
};

export function initialState(config: ScoreboardConfig): ScoreboardState {
  return {
    config,
    scoreA: 0,
    scoreB: 0,
    setsA: 0,
    setsB: 0,
    setHistory: [],
    version: 0,
    updatedAt: Date.now(),
  };
}

/** Sets required to win the match (e.g. bestOf=3 → 2). */
export function setsToWin(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

export function matchWinner(s: ScoreboardState): TeamId | null {
  const need = setsToWin(s.config.bestOf);
  if (s.setsA >= need) return 'A';
  if (s.setsB >= need) return 'B';
  return null;
}

/** True when current set score satisfies target + win-by for `team`. */
export function isSetWon(s: ScoreboardState, team: TeamId): boolean {
  const own = team === 'A' ? s.scoreA : s.scoreB;
  const opp = team === 'A' ? s.scoreB : s.scoreA;
  return own >= s.config.targetScore && own - opp >= s.config.winBy;
}

export function increment(s: ScoreboardState, team: TeamId, delta: 1 | -1): ScoreboardState {
  const next = { ...s };
  if (team === 'A') next.scoreA = Math.max(0, s.scoreA + delta);
  else next.scoreB = Math.max(0, s.scoreB + delta);
  next.version = s.version + 1;
  next.updatedAt = Date.now();
  return next;
}

/** Commit the current set to the team's column and reset point scores. */
export function commitSet(s: ScoreboardState, team: TeamId): ScoreboardState {
  return {
    ...s,
    setsA: team === 'A' ? s.setsA + 1 : s.setsA,
    setsB: team === 'B' ? s.setsB + 1 : s.setsB,
    setHistory: [...s.setHistory, { a: s.scoreA, b: s.scoreB }],
    scoreA: 0,
    scoreB: 0,
    version: s.version + 1,
    updatedAt: Date.now(),
  };
}

export function resetMatch(config: ScoreboardConfig, version: number): ScoreboardState {
  return { ...initialState(config), version: version + 1 };
}

export function swapSides(s: ScoreboardState): ScoreboardState {
  return {
    ...s,
    config: { ...s.config, teamA: s.config.teamB, teamB: s.config.teamA },
    scoreA: s.scoreB,
    scoreB: s.scoreA,
    setsA: s.setsB,
    setsB: s.setsA,
    setHistory: s.setHistory.map((h) => ({ a: h.b, b: h.a })),
    version: s.version + 1,
    updatedAt: Date.now(),
  };
}
