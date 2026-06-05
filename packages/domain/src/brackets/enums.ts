export type BracketFormat =
  | 'single_elimination'
  | 'double_elimination'
  | 'round_robin'
  | 'pool_play_playoff';

export const BRACKET_FORMATS: readonly BracketFormat[] = [
  'single_elimination',
  'double_elimination',
  'round_robin',
  'pool_play_playoff',
] as const;

/**
 * Bracket lifecycle (ADR 0032):
 *  - `setup`     — configuring; seeds may exist, no matches generated yet.
 *  - `draft`     — generated, fully editable (pools, schedule, matchups,
 *                  playoff). Not yet live; spectators don't score it.
 *  - `active`    — published / "Live". Scoring is on; targeted edits allowed.
 *  - `completed` — every match resolved. Locked, but `reopen()`-able.
 */
export type BracketStatus = 'setup' | 'draft' | 'active' | 'completed';

export type MatchStatus = 'pending' | 'in_progress' | 'completed' | 'bye';

export type BracketSide = 'winners' | 'losers' | 'final';

export type AdvanceSlot = 'a' | 'b';

/**
 * Strategy for distributing byes in single-elimination when team count is
 * not a power of two.
 *  - `top_seeds`: highest seeds receive byes vs phantom slots in round 1.
 *  - `play_in`:   lowest seeds play a play-in round; v1 implements `top_seeds`.
 */
export type ByeStrategy = 'top_seeds' | 'play_in';

/**
 * Minimum registered team count required to create a bracket of the
 * given format. Used by the create handler to fail fast with a clear
 * `ValidationError` rather than letting the host commit a format that
 * cannot legally generate. Mirrors the values surfaced in the format
 * picker UI — keep both in sync.
 *
 * Note: a count at or above this floor is necessary but not always
 * sufficient — double elimination additionally needs a power-of-two field.
 * Use {@link validateTeamCountForFormat} for the full precondition.
 */
export function minTeamsForFormat(format: BracketFormat): number {
  switch (format) {
    case 'single_elimination':
      return 2;
    case 'double_elimination':
      // The v1 generator needs ≥ 4 AND a power of two (see
      // generateDoubleElimination). The floor is 4; the power-of-two shape
      // is enforced by validateTeamCountForFormat.
      return 4;
    case 'round_robin':
      return 3;
    case 'pool_play_playoff':
      return 4;
  }
}

/** True for n in {1, 2, 4, 8, 16, …}. */
function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
}

/** Largest power of two ≤ n (n ≥ 1). */
function floorPowerOfTwo(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/**
 * Validate a team count against a format's **structural** requirements — the
 * {@link minTeamsForFormat} floor plus any shape constraint the generator
 * imposes. Double elimination (v1) additionally needs a power-of-two field
 * (4, 8, 16, 32, …) so the losers-bracket pairing stays clean (see
 * {@link generateDoubleElimination}); the other formats only have a minimum.
 *
 * Returns a structured result so the create handler, the format picker, and
 * the setup "Generate" gate all enforce the **same** rule with one message,
 * instead of letting the host commit a field that only fails late inside the
 * generator (TT-9). Pure — safe to call from a client component.
 */
export function validateTeamCountForFormat(
  format: BracketFormat,
  teamCount: number,
): { ok: true } | { ok: false; reason: string } {
  const min = minTeamsForFormat(format);
  if (teamCount < min) {
    return {
      ok: false,
      reason: `This format needs at least ${min} team${min === 1 ? '' : 's'}; you have ${teamCount}.`,
    };
  }
  if (format === 'double_elimination' && !isPowerOfTwo(teamCount)) {
    const lower = floorPowerOfTwo(teamCount); // ≥ 4 because teamCount ≥ min (4)
    const higher = lower * 2;
    return {
      ok: false,
      reason:
        'Double elimination needs a power-of-two field (4, 8, 16, 32, …). ' +
        `You have ${teamCount} — drop to ${lower} or add ${higher - teamCount} to reach ${higher}.`,
    };
  }
  return { ok: true };
}
