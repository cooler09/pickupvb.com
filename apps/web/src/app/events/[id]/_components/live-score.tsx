'use client';

import { useLiveScore } from './live-scores-provider';

/**
 * In-place live score for a match being scored on the scoreboard right now
 * (ADR 0023 Phase 5). Self-hiding: renders nothing unless the
 * {@link LiveScoresProvider} has a live row for `matchId`, so it's safe to drop
 * into any match card unconditionally. Generic over bracket (set-by-set) and
 * league (single game): shows the current rally score, plus sets won when the
 * format is multi-set.
 */
export function LiveScore({ matchId, className }: { matchId: string; className?: string }) {
  const live = useLiveScore(matchId);
  if (!live) return null;
  const multiSet = live.config.bestOf > 1;
  // One coherent utterance for AT, updated politely as the score changes. The
  // visible badge is marked decorative so screen readers hear this sentence
  // once per change rather than re-reading "Live", the digits, and "sets"
  // separately (B1).
  const announcement = multiSet
    ? `Live score ${live.scoreA} to ${live.scoreB}, sets ${live.setsA} to ${live.setsB}`
    : `Live score ${live.scoreA} to ${live.scoreB}`;
  return (
    <div className={className ?? 'mt-2 flex flex-wrap items-center gap-2 text-xs'}>
      <span
        aria-hidden="true"
        className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 font-semibold tracking-wide text-red-500 uppercase"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        Live
      </span>
      <span aria-hidden="true" className="text-fg font-mono tabular-nums">
        {live.scoreA}
        <span className="text-muted">–</span>
        {live.scoreB}
      </span>
      {multiSet && (
        <span aria-hidden="true" className="text-muted">
          sets {live.setsA}–{live.setsB}
        </span>
      )}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </div>
  );
}
