'use client';

import { setsToWin, type LiveMatchScore, type MatchSide } from '@pickupvb/domain';
import { useLiveScore } from './live-scores-provider';

/**
 * In-place live score for a match being scored on the scoreboard right now
 * (ADR 0023 Phase 5). Self-hiding: renders nothing unless the
 * {@link LiveScoresProvider} has a live row for `matchId`, so it's safe to drop
 * into any match card unconditionally.
 *
 * Game-aligned (not match-aligned): the synced {@link LiveMatchScore} already
 * carries every game's score (`setHistory` for finished games + the current
 * rally), so a best-of-N renders as an N-column box score — teams down the
 * side, games across the top — instead of collapsing to a single
 * `score / sets-won` line. The in-progress game is flagged with a pulsing dot
 * and grows the grid one column at a time (G1 → G2 → G3). Read-side only: the
 * official result is still written once via "Save final to match".
 */

type LiveGame = {
  /** 1-based game number. */
  n: number;
  a: number;
  b: number;
  /** This is the game currently being scored. */
  live: boolean;
  /** Winner of a finished game; null while live or on a tie. */
  winner: MatchSide | null;
};

/**
 * Project the synced live state into the per-game scoreline. Finished games come
 * from `setHistory`; the in-progress game (current rally) is appended only while
 * the match is undecided and there's a game left to play — so we never render a
 * phantom column once someone has clinched the best-of-N. Pure (no React) so the
 * "best of 3 → 3 games" mapping is unit-testable in isolation.
 */
export function liveGames(live: LiveMatchScore): LiveGame[] {
  const { config, scoreA, scoreB, setsA, setsB, setHistory } = live;
  const games: LiveGame[] = setHistory.map((h, i) => ({
    n: i + 1,
    a: h.a,
    b: h.b,
    live: false,
    winner: h.a > h.b ? 'A' : h.b > h.a ? 'B' : null,
  }));
  const decided = Math.max(setsA, setsB) >= setsToWin(config.bestOf);
  if (!decided && games.length < config.bestOf) {
    games.push({ n: games.length + 1, a: scoreA, b: scoreB, live: true, winner: null });
  }
  return games;
}

/** Emphasis for one team's cell in a game column. */
function cellTone(side: MatchSide, g: LiveGame): string {
  if (g.live) {
    const lead = g.a === g.b ? null : g.a > g.b ? 'A' : 'B';
    return lead === side ? 'text-fg font-semibold' : 'text-fg/60';
  }
  return g.winner === side ? 'text-fg font-semibold' : 'text-muted';
}

export function LiveScore({ matchId, className }: { matchId: string; className?: string }) {
  const live = useLiveScore(matchId);
  if (!live) return null;
  const games = liveGames(live);
  if (games.length === 0) return null;

  const { config, setsA, setsB } = live;
  const multiSet = config.bestOf > 1;
  const current = games.find((g) => g.live) ?? games[games.length - 1]!;

  // One coherent utterance for AT, updated politely as the score changes. The
  // visible grid is decorative (aria-hidden) so screen readers hear this single
  // sentence per change rather than re-reading every cell (B1).
  const announcement = current.live
    ? `Live, game ${current.n}: ${config.teamA} ${current.a}, ${config.teamB} ${current.b}` +
      (multiSet ? `. Games won ${setsA} to ${setsB}.` : '.')
    : `${config.teamA} ${setsA}, ${config.teamB} ${setsB} in games.`;

  return (
    <div className={className ?? 'mt-2'}>
      <div
        aria-hidden="true"
        className="grid items-center gap-x-2.5 gap-y-0.5 text-xs tabular-nums"
        style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${games.length}, auto)` }}
      >
        {/* Header: game numbers, the live game flagged with a pulsing dot. */}
        <span />
        {games.map((g) => (
          <span
            key={`h-${g.n}`}
            className="text-muted flex items-center justify-end gap-1 text-[0.65rem] font-medium tracking-wide uppercase"
          >
            {g.live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}G{g.n}
          </span>
        ))}

        {/* Team A row. */}
        <span className="text-fg/80 truncate">{config.teamA}</span>
        {games.map((g) => (
          <span key={`a-${g.n}`} className={`text-right ${cellTone('A', g)}`}>
            {g.a}
          </span>
        ))}

        {/* Team B row. */}
        <span className="text-fg/80 truncate">{config.teamB}</span>
        {games.map((g) => (
          <span key={`b-${g.n}`} className={`text-right ${cellTone('B', g)}`}>
            {g.b}
          </span>
        ))}
      </div>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </div>
  );
}
