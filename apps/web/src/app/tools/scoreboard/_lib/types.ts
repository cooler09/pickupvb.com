/**
 * Scoreboard types — a thin alias layer over the `@pickupvb/domain`
 * `LiveMatchScore` value object.
 *
 * The scoring rules themselves now live in the domain
 * (`packages/domain/src/scoring/live-match-score.ts`) per ADR 0023 §2 so they
 * can be shared between this free standalone tool, the Pro live-match surface,
 * and the persisted `match_live_scores` state. This file preserves the
 * scoreboard's historical export names (`ScoreboardState`, `ScoreboardConfig`,
 * `TeamId`, `initialState`, `DEFAULT_CONFIG`) so the setup form, full-screen
 * view, mobile remote, realtime sync hook, and localStorage layer need zero
 * edits. New code should import the domain names directly.
 */

export {
  DEFAULT_LIVE_MATCH_CONFIG as DEFAULT_CONFIG,
  createLiveMatchScore as initialState,
  setsToWin,
  matchWinner,
  isSetWon,
  increment,
  commitSet,
  undoLastSet,
  resetMatch,
  swapSides,
} from '@pickupvb/domain';

export type {
  LiveMatchConfig as ScoreboardConfig,
  LiveMatchScore as ScoreboardState,
  MatchSide as TeamId,
} from '@pickupvb/domain';
