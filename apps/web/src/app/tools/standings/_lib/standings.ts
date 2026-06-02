/**
 * Pure win/loss standings logic for the free standings tool
 * (`/tools/standings`). Records game results between named teams and computes a
 * ranked table with automatic tiebreakers. Pairs with the round-robin
 * scheduler's output.
 *
 * Framework-free and deterministic (no randomness, no `Date.now()` in render —
 * every mutation takes an explicit `now`). Shared across devices via
 * `useRoomSync`: the whole `StandingsState` is broadcast last-write-wins, so it
 * carries the `version`/`updatedAt` the room engine needs.
 *
 * Tiebreaker order (highest first): wins → head-to-head wins among the tied
 * group → point differential → points for → name. Head-to-head counts only
 * games played between the teams that are tied, the standard "mini-league" rule
 * (works for a 2-way tie or larger).
 */

export type GameResult = {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
};

export type StandingsState = {
  version: number;
  updatedAt: number;
  teams: string[];
  results: GameResult[];
};

export type StandingRow = {
  rank: number;
  name: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
};

export function createStandingsState(now = Date.now()): StandingsState {
  return { version: 0, updatedAt: now, teams: [], results: [] };
}

function bump(state: StandingsState, patch: Partial<StandingsState>, now: number): StandingsState {
  return { ...state, ...patch, version: state.version + 1, updatedAt: now };
}

/** Add teams (deduped against existing + each other; blanks dropped). */
export function addTeams(
  state: StandingsState,
  names: readonly string[],
  now = Date.now(),
): StandingsState {
  const existing = new Set(state.teams);
  const additions: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (name.length > 0 && !existing.has(name)) {
      existing.add(name);
      additions.push(name);
    }
  }
  if (additions.length === 0) return state;
  return bump(state, { teams: [...state.teams, ...additions] }, now);
}

/** Remove a team and any results that reference it. */
export function removeTeam(state: StandingsState, name: string, now = Date.now()): StandingsState {
  if (!state.teams.includes(name)) return state;
  return bump(
    state,
    {
      teams: state.teams.filter((t) => t !== name),
      results: state.results.filter((r) => r.home !== name && r.away !== name),
    },
    now,
  );
}

/** Record a game. No-op unless both teams exist and differ; scores clamp ≥0. */
export function recordResult(
  state: StandingsState,
  result: GameResult,
  now = Date.now(),
): StandingsState {
  const { home, away } = result;
  if (home === away || !state.teams.includes(home) || !state.teams.includes(away)) return state;
  const homeScore = Math.max(0, Math.floor(result.homeScore));
  const awayScore = Math.max(0, Math.floor(result.awayScore));
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return state;
  return bump(state, { results: [...state.results, { home, away, homeScore, awayScore }] }, now);
}

/** Remove the result at `index` (e.g. an undo of the last entry). */
export function removeResult(
  state: StandingsState,
  index: number,
  now = Date.now(),
): StandingsState {
  if (index < 0 || index >= state.results.length) return state;
  return bump(state, { results: state.results.filter((_, i) => i !== index) }, now);
}

type Tally = { wins: number; losses: number; played: number; pf: number; pa: number };
type BaseRow = Omit<StandingRow, 'rank'>;

function winnerOf(r: GameResult): string | null {
  if (r.homeScore > r.awayScore) return r.home;
  if (r.awayScore > r.homeScore) return r.away;
  return null; // equal scores — counts as played, no W/L
}

/** Wins `name` has against members of `group`, counting only games between them. */
function headToHeadWins(
  name: string,
  group: ReadonlySet<string>,
  results: readonly GameResult[],
): number {
  let wins = 0;
  for (const r of results) {
    const winner = winnerOf(r);
    if (winner !== name) continue;
    const opponent = r.home === name ? r.away : r.home;
    if (group.has(opponent)) wins += 1;
  }
  return wins;
}

/** Compute the ranked standings table with the tiebreaker chain above. */
export function computeStandings(state: StandingsState): StandingRow[] {
  const tally = new Map<string, Tally>();
  for (const t of state.teams) tally.set(t, { wins: 0, losses: 0, played: 0, pf: 0, pa: 0 });

  for (const r of state.results) {
    const h = tally.get(r.home);
    const a = tally.get(r.away);
    if (!h || !a) continue; // references a removed team — skip
    h.played += 1;
    a.played += 1;
    h.pf += r.homeScore;
    h.pa += r.awayScore;
    a.pf += r.awayScore;
    a.pa += r.homeScore;
    const winner = winnerOf(r);
    if (winner === r.home) {
      h.wins += 1;
      a.losses += 1;
    } else if (winner === r.away) {
      a.wins += 1;
      h.losses += 1;
    }
  }

  const rows: BaseRow[] = state.teams.map((name) => {
    const t = tally.get(name) ?? { wins: 0, losses: 0, played: 0, pf: 0, pa: 0 };
    return {
      name,
      played: t.played,
      wins: t.wins,
      losses: t.losses,
      pointsFor: t.pf,
      pointsAgainst: t.pa,
      diff: t.pf - t.pa,
    };
  });

  // Group by wins (desc), then break ties within each group by head-to-head,
  // then point differential, points for, and finally name.
  const byWins = [...rows].sort((a, b) => b.wins - a.wins);
  const groups: BaseRow[][] = [];
  for (const row of byWins) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.wins === row.wins) last.push(row);
    else groups.push([row]);
  }

  const ordered: BaseRow[] = [];
  for (const group of groups) {
    if (group.length === 1) {
      ordered.push(group[0]!);
      continue;
    }
    const names = new Set(group.map((r) => r.name));
    const h2h = new Map(group.map((r) => [r.name, headToHeadWins(r.name, names, state.results)]));
    const sorted = [...group].sort(
      (a, b) =>
        (h2h.get(b.name) ?? 0) - (h2h.get(a.name) ?? 0) ||
        b.diff - a.diff ||
        b.pointsFor - a.pointsFor ||
        a.name.localeCompare(b.name),
    );
    ordered.push(...sorted);
  }

  return ordered.map((row, i) => ({ rank: i + 1, ...row }));
}

/** Render the standings table as a plain-text block for the "Copy" button. */
export function formatStandingsText(rows: readonly StandingRow[]): string {
  return rows
    .map((r) => `${r.rank}. ${r.name}  ${r.wins}-${r.losses}  (${r.diff >= 0 ? '+' : ''}${r.diff})`)
    .join('\n');
}
