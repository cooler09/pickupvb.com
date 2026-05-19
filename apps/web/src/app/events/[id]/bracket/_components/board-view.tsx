import {
  computePoolStandings,
  distinctPools,
  type BracketFormat,
  type Match,
  type PoolStanding,
} from '@pickupvb/domain';
import { generatePlayoff, resetBracket } from '../actions';
import { MatchCard } from './match-card';
import type { TeamLite } from './labels';

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

  const renderRoundColumns = (
    list: ReadonlyArray<Match>,
    roundLabel: (r: number) => string = (r) => `Round ${r}`,
  ) => (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {groupByRound(list).map(({ round, matches }) => (
        <div key={round} className="min-w-[260px] space-y-2">
          <h3 className="text-fg/80 text-sm font-semibold">{roundLabel(round)}</h3>
          {matches
            .slice()
            .sort((a, b) => a.matchNumber - b.matchNumber)
            .map((m) => (
              <MatchCard
                key={m.id}
                eventId={props.eventId}
                divisionId={props.divisionId}
                match={m}
                teamById={props.teamById}
                bestOf={props.bestOf}
                isHost={props.isHost}
                viewerId={props.viewerId}
              />
            ))}
        </div>
      ))}
    </div>
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted text-sm">
          Best of {props.bestOf} • {props.status === 'completed' ? 'Final results' : 'In progress'}
        </p>
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
                <button
                  type="submit"
                  className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                >
                  Reset and re-seed
                </button>
              </form>
            </div>
          </details>
        )}
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
              <button
                type="submit"
                className="bg-primary text-primary-fg rounded px-3 py-1 text-xs"
              >
                Generate playoff
              </button>
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

function groupByRound(list: ReadonlyArray<Match>): { round: number; matches: Match[] }[] {
  const byRound = new Map<number, Match[]>();
  for (const m of list) {
    const arr = byRound.get(m.round) ?? [];
    arr.push(m);
    byRound.set(m.round, arr);
  }
  return Array.from(byRound.keys())
    .sort((a, b) => a - b)
    .map((r) => ({ round: r, matches: byRound.get(r)! }));
}

function PoolsView(props: {
  eventId: string;
  divisionId: string;
  matches: ReadonlyArray<Match>;
  teamById: ReadonlyMap<string, TeamLite>;
  bestOf: number;
  isHost: boolean;
  viewerId: string | null;
}) {
  const pools = distinctPools(props.matches);
  return (
    <div className="space-y-6">
      {pools.map((pool) => {
        const poolMatches = props.matches.filter((m) => m.pool === pool);
        const standings = computePoolStandings(props.matches, pool);
        return (
          <div key={pool} className="space-y-2">
            <h2 className="text-fg text-base font-semibold">Pool {pool}</h2>
            <PoolStandingsTable standings={standings} teamById={props.teamById} />
            <div className="flex flex-wrap gap-2">
              {poolMatches
                .slice()
                .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber)
                .map((m) => (
                  <div key={m.id} className="min-w-[220px]">
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
                ))}
            </div>
          </div>
        );
      })}
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
