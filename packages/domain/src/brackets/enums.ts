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

export type BracketStatus = 'setup' | 'active' | 'completed';

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
