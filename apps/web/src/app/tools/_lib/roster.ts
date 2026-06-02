/**
 * Shared, framework-free roster primitives for the pure-client host tools under
 * `/tools` (team randomizer, seeding, cost split, …). Lives in `app/tools/_lib`
 * — the underscore keeps Next from treating it as a route — so several tools
 * parse "name + optional trailing number" rosters and snake-distribute lists
 * without each re-deriving (and drifting on) the regex or the draft loop.
 *
 * Deterministic by construction: the only randomness, `shuffle`, takes an
 * injectable `rng` (defaults to `Math.random`) so callers stay ergonomic, tests
 * stay deterministic, and the impure read never reaches a render body.
 */

export type Player = {
  name: string;
  /**
   * The optional trailing number on a roster line. Its meaning is the
   * consumer's: a skill rating for the randomizer/seeding, a share weight for
   * the cost splitter. The parse is purely syntactic — "name then number".
   */
  rating?: number;
};

/**
 * Parse a pasted roster into players — one per line. An optional number may
 * trail the name, separated by whitespace, comma, or colon ("Alex 5", "Bo, 3",
 * "Cara: 4.5"). Blank lines are dropped; surrounding whitespace is trimmed.
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

/** True if any player carries a number — gates rating/share-dependent UI. */
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
 * Snake-distribute items across `buckets`: 0,1,…,n-1, n-1,…,1,0, 0,1,… — the
 * bucket at each turn takes two in a row, which is what levels both count and
 * (when the input is sorted by weight) total. Powers balanced team-splitting
 * and snake seeding into pools. `buckets` is clamped to at least 1.
 */
export function snakeDistribute<T>(items: readonly T[], buckets: number): T[][] {
  const n = Math.max(1, Math.floor(buckets));
  const result: T[][] = Array.from({ length: n }, () => []);
  let idx = 0;
  let dir = 1;
  for (const item of items) {
    result[idx]?.push(item);
    if (dir === 1) {
      if (idx === n - 1) dir = -1;
      else idx++;
    } else if (idx === 0) dir = 1;
    else idx--;
  }
  return result;
}
