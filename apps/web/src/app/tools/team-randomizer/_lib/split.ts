/**
 * Team-splitting logic for the free Team randomizer tool
 * (`/tools/team-randomizer`). The roster parse, shuffle, and snake distribution
 * are shared primitives ([`../../_lib/roster.ts`](../../_lib/roster.ts)) —
 * re-exported here so existing call sites and tests keep their single import.
 * This file owns only the team-shaped logic on top of them.
 *
 * Pure, no module-scope randomness: the shuffle takes an injectable `rng`, so
 * the algorithm is deterministically testable and `Math.random` is only ever
 * called from an event handler (never a render body — React-Compiler safe).
 */

import {
  type Player,
  parseRoster,
  hasRatings,
  shuffle,
  snakeDistribute,
} from '../../_lib/roster.js';

export { type Player, parseRoster, hasRatings, shuffle };

export type Team = {
  players: Player[];
};

export type SplitMode = 'random' | 'balanced';

/**
 * Split players into `teamCount` teams.
 *
 *  - **random** — shuffle, then deal round-robin so team sizes differ by ≤1.
 *  - **balanced** — snake draft by rating (unrated players take the mean of the
 *    rated ones) so both head-count and total skill are spread evenly. Players
 *    are shuffled first, so equal-rated players don't always land in input
 *    order.
 *
 * `teamCount` is clamped to at least 1; the caller (UI) keeps it within
 * `[2, players.length]`.
 */
export function splitTeams(
  players: readonly Player[],
  teamCount: number,
  mode: SplitMode,
  rng: () => number = Math.random,
): Team[] {
  const n = Math.max(1, Math.floor(teamCount));

  if (mode === 'balanced') {
    const rated = players.filter((p): p is Player & { rating: number } => p.rating !== undefined);
    const mean = rated.length ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : 0;
    const effective = (p: Player) => (p.rating !== undefined ? p.rating : mean);
    const ordered = shuffle(players, rng).sort((a, b) => effective(b) - effective(a));
    return snakeDistribute(ordered, n).map((bucket) => ({ players: bucket }));
  }

  const teams: Team[] = Array.from({ length: n }, () => ({ players: [] }));
  shuffle(players, rng).forEach((p, i) => {
    teams[i % n]?.players.push(p);
  });
  return teams;
}

/** Per-team head-count + skill totals for the result display. */
export function teamSummary(team: Team): { count: number; total: number; avg: number | null } {
  const rated = team.players.filter(
    (p): p is Player & { rating: number } => p.rating !== undefined,
  );
  const total = rated.reduce((s, p) => s + p.rating, 0);
  return { count: team.players.length, total, avg: rated.length ? total / rated.length : null };
}

/** Render teams as a plain-text block for the "Copy" button. */
export function formatTeamsText(teams: readonly Team[]): string {
  return teams
    .map((team, i) => {
      const lines = team.players.map(
        (p) => `- ${p.name}${p.rating !== undefined ? ` (${p.rating})` : ''}`,
      );
      return [`Team ${i + 1}`, ...lines].join('\n');
    })
    .join('\n\n');
}
