/**
 * Pure seeding logic for the free seeding tool (`/tools/seeding`). Builds a
 * seed order from a roster (ranked by rating or a random draw) and optionally
 * snake-distributes it into pools. Reuses the shared roster primitives
 * ([`../../_lib/roster.ts`](../../_lib/roster.ts)) — the parse, shuffle, and
 * snake draft — so nothing here re-derives them.
 *
 * The only randomness is `shuffle`'s injectable `rng`, so the algorithm is
 * deterministically testable and `Math.random` stays out of render bodies.
 */

import { type Player, shuffle, snakeDistribute } from '../../_lib/roster.js';

export { parseRoster, hasRatings, type Player } from '../../_lib/roster.js';

export type SeedMode = 'ranked' | 'random';

export type Seed = {
  /** 1-based overall seed number. */
  seed: number;
  name: string;
  rating?: number;
};

/**
 * Produce a seeded order.
 *
 *  - **ranked** — by rating descending; ties and unrated players keep input
 *    order (stable). With no ratings at all this is effectively "as entered".
 *  - **random** — a random draw.
 */
export function seedOrder(
  players: readonly Player[],
  mode: SeedMode,
  rng: () => number = Math.random,
): Seed[] {
  const ordered =
    mode === 'ranked'
      ? [...players].sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity))
      : shuffle(players, rng);

  return ordered.map((p, i) => ({
    seed: i + 1,
    name: p.name,
    ...(p.rating !== undefined ? { rating: p.rating } : {}),
  }));
}

/**
 * Snake the seeded order into `pools` pools so seed strength is balanced across
 * them (seed 1 → pool 1, seed 2 → pool 2, … then back). `pools` is clamped to
 * at least 1; a single pool returns the flat seed list in one bucket.
 */
export function intoPools(seeds: readonly Seed[], pools: number): Seed[][] {
  return snakeDistribute(seeds, pools);
}

/** Render the seeding as a plain-text block for the "Copy" button. */
export function formatSeedsText(pools: readonly Seed[][]): string {
  const single = pools.length <= 1;
  return pools
    .map((pool, p) => {
      const lines = pool.map(
        (s) => `${s.seed}. ${s.name}${s.rating !== undefined ? ` (${s.rating})` : ''}`,
      );
      return single ? lines.join('\n') : [`Pool ${poolLabel(p)}`, ...lines].join('\n');
    })
    .join(single ? '\n' : '\n\n');
}

/** Pool labels A, B, C, … (wraps to A1, B1… past 26, which no real bracket hits). */
export function poolLabel(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  const wrap = Math.floor(index / 26);
  return wrap > 0 ? `${letter}${wrap}` : letter;
}
