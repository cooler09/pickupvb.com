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
  return (
    <div className={className ?? 'mt-2 flex flex-wrap items-center gap-2 text-xs'}>
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 font-semibold tracking-wide text-red-500 uppercase">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
        Live
      </span>
      <span className="text-fg font-mono tabular-nums">
        {live.scoreA}
        <span className="text-muted">–</span>
        {live.scoreB}
      </span>
      {multiSet && (
        <span className="text-muted">
          sets {live.setsA}–{live.setsB}
        </span>
      )}
    </div>
  );
}
