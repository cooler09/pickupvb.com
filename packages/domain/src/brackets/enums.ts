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
 */
export function minTeamsForFormat(format: BracketFormat): number {
  switch (format) {
    case 'single_elimination':
      return 2;
    case 'double_elimination':
      return 3;
    case 'round_robin':
      return 3;
    case 'pool_play_playoff':
      return 4;
  }
}
