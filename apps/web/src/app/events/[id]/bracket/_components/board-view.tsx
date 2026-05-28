import {
  computePoolStandings,
  distinctPools,
  type BracketFormat,
  type Match,
  type PoolStanding,
} from '@pickupvb/domain';
import { generatePlayoff, movePoolMatchFromForm, resetBracket } from '../actions';
import { MatchCard } from './match-card';
import type { TeamLite } from './labels';
import { SubmitButton } from '@/components/submit-button';
import { primaryButtonClass } from '@/components/primary-button';
import { TreeBracket } from './tree-bracket';

/**
 * Pick the match a spectator most likely wants to look at right now.
 *
 *   1. In-progress: a match with any sets recorded that isn't yet
 *      completed. Tie-break by highest round, then highest matchNumber
 *      (deepest into the bracket = most consequential).
 *   2. Most recently completed: same tie-break — the last finished match.
 *   3. Next up: lowest-numbered pending match with both teams known.
 *
 * Returns `null` when the bracket has no eligible matches yet (all TBD).
 */
export function pickLatestMatchId(matches: ReadonlyArray<Match>): string | null {
  const live = matches.filter(
    (m) =>
      m.status === 'in_progress' ||
      (m.status !== 'completed' && m.status !== 'bye' && m.sets.length > 0),
  );
  if (live.length > 0) {
    const m = [...live].sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber)[0]!;
    return String(m.id);
  }
  const done = matches.filter((m) => m.status === 'completed');
  if (done.length > 0) {
    const m = [...done].sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber)[0]!;
    return String(m.id);
  }
  const next = matches.filter((m) => m.status === 'pending' && m.teamAId && m.teamBId);
  if (next.length > 0) {
    const m = [...next].sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber)[0]!;
    return String(m.id);
  }
  return null;
}

export function BoardView(props: {
  eventId: string;
  divisionId: string;
  matches: ReadonlyArray<Match>;
  teamById: ReadonlyMap<string, TeamLite>;
  bestOf: number;
  isHost: boolean;
  viewerId: string | null;
  status: 'active' | 'completed';
  format: BracketFormat;
  /** When set, the matching card is rendered with a ring and a "Jump to latest" link appears at the top. */
  highlightMatchId?: string | null;
}) {
  const isPoolPlay = props.format === 'pool_play_playoff';
  const isDoubleElim = props.format === 'double_elimination';
  const poolMatches = props.matches.filter((m) => m.pool !== null);
  const playoffMatches = props.matches.filter((m) => m.bracketSide === 'final');
  const winnersMatches = props.matches.filter((m) => m.bracketSide === 'winners');
  const losersMatches = props.matches.filter((m) => m.bracketSide === 'losers');
  const otherMatches = props.matches.filter(
    (m) =>
      m.pool === null &&
      m.bracketSide !== 'final' &&
      m.bracketSide !== 'winners' &&
      m.bracketSide !== 'losers',
  );

  // For pool play, "pool play complete" gates the playoff CTA.
  const poolPlayComplete =
    isPoolPlay &&
    poolMatches.length > 0 &&
    poolMatches.every((m) => m.status === 'completed' || m.status === 'bye');
  const playoffExists = playoffMatches.length > 0;

  const renderMatch = (m: Match) => {
    const isHighlighted = !!props.highlightMatchId && String(m.id) === props.highlightMatchId;
    return (
      <div
        id={`match-${String(m.id)}`}
        className={`scroll-mt-24 rounded-lg ${isHighlighted ? 'ring-primary ring-2 ring-offset-2 ring-offset-transparent' : ''}`}
      >
        <MatchCard
          eventId={props.eventId}
          divisionId={props.divisionId}
          match={m}
          teamById={props.teamById}
          bestOf={props.bestOf}
          isHost={props.isHost}
          viewerId={props.viewerId}
        />
      </div>
    );
  };

  const renderRoundColumns = (
    list: ReadonlyArray<Match>,
    roundLabel: (r: number) => string = (r) => `Round ${r}`,
  ) => <TreeBracket matches={list} renderMatch={renderMatch} roundLabel={roundLabel} />;

  return (
    <section className="space-y-6 scroll-smooth">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted text-sm">
          Best of {props.bestOf} • {props.status === 'completed' ? 'Final results' : 'In progress'}
        </p>
        <div className="flex items-center gap-2">
          {props.highlightMatchId && (
            <a
              href={`#match-${props.highlightMatchId}`}
              className="border-primary/40 text-primary hover:bg-primary/5 rounded border px-2 py-1 text-xs font-medium"
            >
              {'Jump to latest →'}
            </a>
          )}
          {props.isHost && props.status === 'active' && (
            <details className="text-xs">
              <summary className="cursor-pointer rounded border border-red-500/40 px-2 py-1 text-red-600 hover:bg-red-500/10">
                Reset bracket
              </summary>
              <div className="mt-2 space-y-2 rounded border border-red-500/30 bg-red-500/5 p-2">
                <p className="text-red-700 dark:text-red-300">
                  Returns the bracket to seeding so you can swap teams in or out, then re-generate.
                  Any entered match results will be discarded.
                </p>
                <form action={resetBracket.bind(null, props.eventId, props.divisionId)}>
                  <SubmitButton className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50">
                    Reset and re-seed
                  </SubmitButton>
                </form>
              </div>
            </details>
          )}
        </div>
      </div>

      {isPoolPlay && poolMatches.length > 0 && (
        <PoolsView
          eventId={props.eventId}
          divisionId={props.divisionId}
          matches={poolMatches}
          teamById={props.teamById}
          bestOf={props.bestOf}
          isHost={props.isHost}
          viewerId={props.viewerId}
          highlightMatchId={props.highlightMatchId ?? null}
        />
      )}

      {isPoolPlay && poolPlayComplete && !playoffExists && (
        <div className="border-primary/40 bg-primary/5 rounded-lg border p-3 text-sm">
          {props.isHost ? (
            <form
              action={generatePlayoff.bind(null, props.eventId, props.divisionId)}
              className="flex items-center justify-between gap-2"
            >
              <span>Pool play is complete. Generate the playoff bracket?</span>
              <SubmitButton className={primaryButtonClass()}>Generate playoff</SubmitButton>
            </form>
          ) : (
            <span className="text-muted">
              Pool play is complete. Waiting for the host to generate the playoff.
            </span>
          )}
        </div>
      )}

      {isDoubleElim && winnersMatches.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-fg text-base font-semibold">Winners bracket</h2>
          {renderRoundColumns(winnersMatches, (r) => `WB R${r}`)}
        </div>
      )}

      {isDoubleElim && losersMatches.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-fg text-base font-semibold">Losers bracket</h2>
          {renderRoundColumns(losersMatches, (r) => `LB R${r}`)}
        </div>
      )}

      {isDoubleElim && playoffMatches.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-fg text-base font-semibold">Grand final</h2>
          {renderRoundColumns(playoffMatches, () => 'Final')}
        </div>
      )}

      {!isDoubleElim && (otherMatches.length > 0 || playoffMatches.length > 0) && (
        <div className="space-y-2">
          {isPoolPlay && playoffMatches.length > 0 && (
            <h2 className="text-fg text-base font-semibold">Playoff</h2>
          )}
          {renderRoundColumns([...otherMatches, ...playoffMatches])}
        </div>
      )}
    </section>
  );
}

function PoolsView(props: {
  eventId: string;
  divisionId: string;
  matches: ReadonlyArray<Match>;
  teamById: ReadonlyMap<string, TeamLite>;
  bestOf: number;
  isHost: boolean;
  viewerId: string | null;
  highlightMatchId: string | null;
}) {
  const pools = distinctPools(props.matches);
  return (
    <div className="space-y-6">
      {pools.map((pool) => {
        const poolMatches = props.matches.filter((m) => m.pool === pool);
        const standings = computePoolStandings(props.matches, pool);
        const sortedPoolMatches = poolMatches
          .slice()
          .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber);
        const orderedIds = sortedPoolMatches.map((m) => String(m.id));
        // Reorder is allowed when the host hasn't started any pool match.
        const canReorder =
          props.isHost && poolMatches.every((m) => m.status === 'pending' || m.status === 'bye');
        return (
          <div key={pool} className="space-y-2">
            <h2 className="text-fg text-base font-semibold">Pool {pool}</h2>
            <PoolStandingsTable standings={standings} teamById={props.teamById} />
            <div className="flex flex-wrap gap-2">
              {sortedPoolMatches.map((m, i) => {
                const isHighlighted = props.highlightMatchId === String(m.id);
                return (
                  <div
                    key={m.id}
                    id={`match-${String(m.id)}`}
                    className={`min-w-55 scroll-mt-24 rounded-lg ${isHighlighted ? 'ring-primary ring-2 ring-offset-2 ring-offset-transparent' : ''}`}
                  >
                    {canReorder && (
                      <ReorderControls
                        eventId={props.eventId}
                        divisionId={props.divisionId}
                        pool={pool}
                        matchId={String(m.id)}
                        orderedIds={orderedIds}
                        canMoveUp={i > 0}
                        canMoveDown={i < sortedPoolMatches.length - 1}
                      />
                    )}
                    <MatchCard
                      eventId={props.eventId}
                      divisionId={props.divisionId}
                      match={m}
                      teamById={props.teamById}
                      bestOf={props.bestOf}
                      isHost={props.isHost}
                      viewerId={props.viewerId}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReorderControls(props: {
  eventId: string;
  divisionId: string;
  pool: string;
  matchId: string;
  orderedIds: ReadonlyArray<string>;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const action = movePoolMatchFromForm.bind(null, props.eventId, props.divisionId, props.pool);
  return (
    <div className="text-muted mb-1 flex items-center gap-1 text-xs">
      <span className="mr-1">Order:</span>
      <form action={action}>
        {props.orderedIds.map((id) => (
          <input key={id} type="hidden" name="match_id" value={id} />
        ))}
        <input type="hidden" name="move_id" value={props.matchId} />
        <input type="hidden" name="direction" value="up" />
        <button
          type="submit"
          disabled={!props.canMoveUp}
          aria-label="Move match earlier"
          className="border-border-base tap-target rounded border disabled:opacity-30"
        >
          ↑
        </button>
      </form>
      <form action={action}>
        {props.orderedIds.map((id) => (
          <input key={id} type="hidden" name="match_id" value={id} />
        ))}
        <input type="hidden" name="move_id" value={props.matchId} />
        <input type="hidden" name="direction" value="down" />
        <button
          type="submit"
          disabled={!props.canMoveDown}
          aria-label="Move match later"
          className="border-border-base tap-target rounded border disabled:opacity-30"
        >
          ↓
        </button>
      </form>
    </div>
  );
}

function PoolStandingsTable(props: {
  standings: ReadonlyArray<PoolStanding>;
  teamById: ReadonlyMap<string, TeamLite>;
}) {
  if (props.standings.length === 0) {
    return <p className="text-muted text-xs">No standings yet.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-muted">
        <tr className="border-border-base border-b">
          <th scope="col" className="px-2 py-1 text-left">
            #
          </th>
          <th scope="col" className="px-2 py-1 text-left">
            Team
          </th>
          <th scope="col" className="px-2 py-1 text-right">
            W
          </th>
          <th scope="col" className="px-2 py-1 text-right">
            L
          </th>
          <th scope="col" className="px-2 py-1 text-right">
            Set diff
          </th>
          <th scope="col" className="px-2 py-1 text-right">
            Pt diff
          </th>
        </tr>
      </thead>
      <tbody>
        {props.standings.map((s, i) => {
          const team = props.teamById.get(String(s.teamId));
          return (
            <tr key={String(s.teamId)} className="border-border-base/40 border-b">
              <td className="text-muted px-2 py-1 tabular-nums">{i + 1}</td>
              <td className="text-fg px-2 py-1">{team?.name ?? '—'}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s.wins}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s.losses}</td>
              <td className="px-2 py-1 text-right tabular-nums">
                {s.setDiff > 0 ? `+${s.setDiff}` : s.setDiff}
              </td>
              <td className="px-2 py-1 text-right tabular-nums">
                {s.pointDiff > 0 ? `+${s.pointDiff}` : s.pointDiff}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
