import type { Match } from '@pickupvb/domain';
import type { ReactNode } from 'react';
import { BracketConnectors, type ConnectorEdge } from './bracket-connectors';

/**
 * Tree-style bracket layout. Renders rounds left-to-right as columns; matches
 * within a round are spread with `justify-around` so a later round's cards sit
 * near the vertical midpoint of their feeders.
 *
 * Connectors are drawn by {@link BracketConnectors} — a measured SVG layer that
 * traces each match's `advancesToMatchId` edge from the real card positions
 * (UX-14). This supersedes the previous CSS border-inset `]` connectors, which
 * assumed equal card heights (an expanded result form knocked them off-center)
 * and only approximated double-elim losers brackets. The SVG approach is exact
 * for any field shape and any card height, and re-measures on resize.
 *
 * Round-robin (and any list without advancement wiring) simply renders the
 * columns with no connectors — correct, since it isn't a tree.
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

  // Winner-advances edges whose target is also in this tree (cross-bracket
  // feeds — a winners match dropping a loser into the losers bracket — live in a
  // different TreeBracket and can't be drawn here). Drives the SVG connectors.
  const ids = new Set(props.matches.map((m) => String(m.id)));
  const edges: ConnectorEdge[] = props.matches
    .filter((m) => m.advancesToMatchId && ids.has(String(m.advancesToMatchId)))
    .map((m) => ({ from: String(m.id), to: String(m.advancesToMatchId) }));

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="relative isolate flex items-stretch gap-4"
        style={{ minHeight: `${minHeightPx}px` }}
      >
        <BracketConnectors edges={edges} />
        {rounds.map((r) => (
          <div key={r.round} className="flex min-w-60 flex-col">
            <h3 className="text-fg/80 mb-1 text-xs font-semibold tracking-wide uppercase">
              {roundLabel(r.round)}
            </h3>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {r.matches.map((m) => (
                <div key={m.id} className="relative">
                  {props.renderMatch(m)}
                </div>
              ))}
            </div>
          </div>
        ))}
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
