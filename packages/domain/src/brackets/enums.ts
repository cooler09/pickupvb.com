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
 * sufficient — pool play additionally needs `poolCount × advancePerPool` teams.
 * Use {@link validateTeamCountForFormat} for the full precondition.
 */
export function minTeamsForFormat(format: BracketFormat): number {
  switch (format) {
    case 'single_elimination':
      return 2;
    case 'double_elimination':
      // The generator needs ≥ 4; non-power-of-two fields get winners-round-1
      // byes (see generateDoubleElimination).
      return 4;
    case 'round_robin':
      return 3;
    case 'pool_play_playoff':
      return 4;
  }
}

/**
 * Validate a team count against a format's **structural** requirements — the
 * {@link minTeamsForFormat} floor plus any shape constraint the generator
 * imposes. Double elimination supports any field of 4+ (non-power-of-two fields
 * get byes in winners-round 1 — see {@link generateDoubleElimination}); pool
 * play additionally needs `poolCount × advancePerPool` teams to seed the playoff.
 *
 * Returns a structured result so the create handler, the format picker, and
 * the setup "Generate" gate all enforce the **same** rule with one message,
 * instead of letting the host commit a field that only fails late inside the
 * generator. Pure — safe to call from a client component.
 *
 * For `pool_play_playoff`, pass the resolved `poolCount` / `advancePerPool`
 * (defaults mirror `DEFAULT_BRACKET_CONFIG`: 2 / 2) so the create gate accounts
 * for the **config**, not just the floor: a field smaller than
 * `poolCount × advancePerPool` can't seed the playoff (TT-16). Omit `opts` to
 * skip that check (e.g. the standalone setup gate, where the domain
 * `generate()` guard is the backstop).
 */
export function validateTeamCountForFormat(
  format: BracketFormat,
  teamCount: number,
  opts?: { poolCount?: number; advancePerPool?: number },
): { ok: true } | { ok: false; reason: string } {
  const min = minTeamsForFormat(format);
  if (teamCount < min) {
    return {
      ok: false,
      reason: `This format needs at least ${min} team${min === 1 ? '' : 's'}; you have ${teamCount}.`,
    };
  }
  if (format === 'pool_play_playoff' && opts) {
    // Defaults mirror DEFAULT_BRACKET_CONFIG (can't import it here — enums is
    // upstream of bracket.ts).
    const poolCount = opts.poolCount ?? 2;
    const advancePerPool = opts.advancePerPool ?? 2;
    const need = poolCount * advancePerPool;
    if (teamCount < need) {
      return {
        ok: false,
        reason:
          `Pool play with ${poolCount} pools advancing ${advancePerPool} per pool needs at ` +
          `least ${need} teams; you have ${teamCount}. Reduce the pool count or advance-per-pool.`,
      };
    }
  }
  return { ok: true };
}
