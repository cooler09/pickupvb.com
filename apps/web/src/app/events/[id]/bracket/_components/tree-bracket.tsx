import type { Match } from '@pickupvb/domain';
import type { ReactNode } from 'react';

/**
 * Tree-style bracket layout. Renders rounds left-to-right with classic
 * "bracket `]`" connectors between sibling pairs:
 *
 *   M1 ─┐
 *       ├─ W1 ─┐
 *   M2 ─┘      │
 *              ├─ F
 *   M3 ─┐      │
 *       ├─ W2 ─┘
 *   M4 ─┘
 *
 * Layout strategy:
 *   * Each round column uses `justify-around` over a shared min-height so
 *     matches in later rounds vertically align with the midpoint of their
 *     two feeders, regardless of the exact match count per round.
 *   * Sibling pairs (consecutive matches with the same parent) are wrapped
 *     in a connector element whose right side draws the `]` glyph via
 *     borders inset to 25%/75% — the midpoints of the two stacked
 *     matches inside the pair.
 *   * Each non-first-round match gets a small `←` stub on its left edge so
 *     the connector visibly enters the match card from the right of the
 *     previous round.
 *
 * Caveats:
 *   * Designed for single-elimination bracket sides where each round has
 *     exactly half the matches of the previous one. For double-elim
 *     losers brackets (which alternate feed/play rounds with non-2:1
 *     ratios), the pair grouping is approximate but still reads as a
 *     tree. Polish is a follow-up.
 *   * MatchCard expands when the host edits a result; the inset
 *     midpoints (25% / 75%) assume roughly equal match heights, so an
 *     expanded card will pull its connector slightly off-center. The
 *     line still reaches the card — just not the exact midpoint.
 */
export function TreeBracket(props: {
  matches: ReadonlyArray<Match>;
  renderMatch: (m: Match) => ReactNode;
  roundLabel?: (round: number) => string;
}) {
  const rounds = groupByRound(props.matches);
  if (rounds.length === 0) return null;

  const roundLabel = props.roundLabel ?? ((r) => `Round ${r}`);
  // Min-height = approximate height per round-1 match, ensures justify-around
  // has room to spread later rounds.
  const minHeightPx = Math.max(360, rounds[0]!.matches.length * 96);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-stretch gap-4" style={{ minHeight: `${minHeightPx}px` }}>
        {rounds.map((r, ri) => {
          const isFirstRound = ri === 0;
          const isLastRound = ri === rounds.length - 1;
          const pairs = chunkPairs(r.matches);

          return (
            <div key={r.round} className="flex min-w-60 flex-col">
              <h3 className="text-fg/80 mb-1 text-xs font-semibold tracking-wide uppercase">
                {roundLabel(r.round)}
              </h3>
              <div className="flex flex-1 flex-col justify-around">
                {pairs.map((pair, pi) => {
                  const drawPairConnector = !isLastRound && pair.length === 2;
                  return (
                    <div
                      key={pi}
                      className={
                        'relative flex flex-col justify-around gap-3 ' +
                        (drawPairConnector ? 'pr-2' : '')
                      }
                    >
                      {pair.map((m) => (
                        <div key={m.id} className="relative">
                          {!isFirstRound && (
                            <span
                              aria-hidden="true"
                              className="border-border-base/60 pointer-events-none absolute top-1/2 -left-2 block w-2 border-t"
                            />
                          )}
                          {props.renderMatch(m)}
                        </div>
                      ))}
                      {drawPairConnector && (
                        <span
                          aria-hidden="true"
                          className="border-border-base/60 pointer-events-none absolute top-1/4 -right-2 bottom-1/4 block w-2 border-y border-r"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function groupByRound(list: ReadonlyArray<Match>): { round: number; matches: Match[] }[] {
  const byRound = new Map<number, Match[]>();
  for (const m of list) {
    const arr = byRound.get(m.round) ?? [];
    arr.push(m);
    byRound.set(m.round, arr);
  }
  return Array.from(byRound.keys())
    .sort((a, b) => a - b)
    .map((r) => ({
      round: r,
      matches: byRound
        .get(r)!
        .slice()
        .sort((a, b) => a.matchNumber - b.matchNumber),
    }));
}

function chunkPairs<T>(items: ReadonlyArray<T>): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    out.push(items.slice(i, i + 2));
  }
  return out;
}
