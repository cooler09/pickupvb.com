/**
 * Pure team-splitting logic for the free Team randomizer tool
 * (`/tools/team-randomizer`). No framework imports, no `Math.random` at module
 * scope — the shuffle takes an injectable `rng` so the algorithm is
 * deterministically testable (`split.test.ts`) and the React-Compiler purity
 * rule is never tripped (the component only calls these from event handlers).
 *
 * The tool is intentionally backend-free: the roster lives in the textarea and
 * nothing is persisted, mirroring the no-signup posture of the scoreboard tool.
 */

export type Player = {
  name: string;
  /** Optional skill rating parsed from the roster line (e.g. "Alex 5"). */
  rating?: number;
};

export type Team = {
  players: Player[];
};

export type SplitMode = 'random' | 'balanced';

/**
 * Parse a pasted roster into players — one per line. An optional skill rating
 * may trail the name, separated by whitespace, comma, or colon
 * ("Alex 5", "Bo, 3", "Cara: 4.5"). Blank lines are dropped; surrounding
 * whitespace is trimmed. A line with no trailing number is a name-only player.
 */
export function parseRoster(raw: string): Player[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // Non-greedy name so the separator run (and any trailing comma/colon)
      // isn't captured into the name — "Bo, 3" → name "Bo", not "Bo,".
      const match = /^(.*?)[\s,:]+(\d+(?:\.\d+)?)$/.exec(line);
      if (match && match[1]) {
        return { name: match[1].trim(), rating: Number(match[2]) };
      }
      return { name: line };
    });
}

/** True if any player carries a skill rating — gates the "balanced" mode UI. */
export function hasRatings(players: readonly Player[]): boolean {
  return players.some((p) => typeof p.rating === 'number');
}

/** Fisher-Yates shuffle. `rng` is injectable so tests stay deterministic. */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const ai = a[i];
    const aj = a[j];
    if (ai !== undefined && aj !== undefined) {
      a[i] = aj;
      a[j] = ai;
    }
  }
  return a;
}

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
  const teams: Team[] = Array.from({ length: n }, () => ({ players: [] }));
  if (players.length === 0) return teams;

  if (mode === 'balanced') {
    const rated = players.filter((p): p is Player & { rating: number } => p.rating !== undefined);
    const mean = rated.length ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : 0;
    const effective = (p: Player) => (p.rating !== undefined ? p.rating : mean);
    const ordered = shuffle(players, rng).sort((a, b) => effective(b) - effective(a));

    // Snake draft: 0,1,…,n-1, n-1,…,1,0, 0,1,… — the team at each turn picks
    // twice in a row, which is what keeps totals level.
    let idx = 0;
    let dir = 1;
    for (const p of ordered) {
      teams[idx]?.players.push(p);
      if (dir === 1) {
        if (idx === n - 1) dir = -1;
        else idx++;
      } else if (idx === 0) dir = 1;
      else idx--;
    }
    return teams;
  }

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
