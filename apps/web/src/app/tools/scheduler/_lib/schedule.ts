/**
 * Pure round-robin scheduling logic for the free scheduler tool
 * (`/tools/scheduler`). Framework-free and deterministic — no `Math.random`, no
 * persistence — so it's unit-tested directly (`schedule.test.ts`) and renders
 * safely under the React Compiler. Mirrors the team-randomizer's pure-`_lib`
 * shape.
 */

export type Match = {
  home: string;
  away: string;
  /** 1-based court number, only set when more than one court is used. */
  court?: number;
};

export type Round = { matches: Match[] };

/** Sentinel pairing partner for the odd-team-out in each round. */
const BYE = '(bye)';

/** Parse pasted team names — one per line, trimmed, blanks dropped. */
export function parseTeams(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Single round-robin via the circle method: every team plays every other team
 * exactly once. With an odd number of teams a `(bye)` is added, so one team
 * sits out each round. Matches in a round are dealt across `courts` in order.
 *
 * Returns `n-1` rounds for `n` teams (`n` rounds when padded for a bye).
 */
export function roundRobin(teamsIn: readonly string[], courts = 1): Round[] {
  // Need two real teams before a bye is ever added — a lone team padded to a
  // `(bye)` would otherwise yield a single empty round.
  if (teamsIn.length < 2) return [];
  const teams = [...teamsIn];
  if (teams.length % 2 === 1) teams.push(BYE);
  const n = teams.length;

  const half = n / 2;
  const courtCount = Math.max(1, Math.floor(courts));
  const fixed = teams[0] ?? BYE;
  let rotating = teams.slice(1); // length n-1, cycles each round
  const rounds: Round[] = [];

  for (let r = 0; r < n - 1; r++) {
    const row = [fixed, ...rotating];
    const matches: Match[] = [];
    for (let i = 0; i < half; i++) {
      const home = row[i];
      const away = row[n - 1 - i];
      if (home && away && home !== BYE && away !== BYE) {
        matches.push({ home, away });
      }
    }
    if (courtCount > 1) {
      matches.forEach((m, k) => {
        m.court = (k % courtCount) + 1;
      });
    }
    rounds.push({ matches });

    // Rotate the non-fixed teams: last moves to the front.
    const last = rotating[rotating.length - 1];
    if (last !== undefined) rotating = [last, ...rotating.slice(0, -1)];
  }

  return rounds;
}

/** Total games scheduled across all rounds. */
export function gameCount(rounds: readonly Round[]): number {
  return rounds.reduce((sum, r) => sum + r.matches.length, 0);
}

/** Render the schedule as a plain-text block for the "Copy" button. */
export function formatScheduleText(rounds: readonly Round[]): string {
  return rounds
    .map((round, i) => {
      const lines = round.matches.map(
        (m) => `- ${m.home} vs ${m.away}${m.court !== undefined ? ` (Court ${m.court})` : ''}`,
      );
      return [`Round ${i + 1}`, ...lines].join('\n');
    })
    .join('\n\n');
}
