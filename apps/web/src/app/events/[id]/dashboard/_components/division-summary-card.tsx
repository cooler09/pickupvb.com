import Link from 'next/link';
import type { Route } from 'next';
import type { CourtMatch } from '../../_lib/court-board';
import type { DivisionBoard, DivisionStanding } from '../../_lib/load-division-boards';
import { LiveScore } from '../../_components/live-score';

/**
 * One division's at-a-glance state on the all-divisions dashboard
 * (tournament-displays slice C): status, progress, champion / standings, and
 * the live + up-next matches. Server component — kept live by the page's
 * realtime refreshers re-rendering it.
 */
export function DivisionSummaryCard({ board, eventId }: { board: DivisionBoard; eventId: string }) {
  const watchHref = (
    board.kind === 'tournament'
      ? `/events/${eventId}/bracket/watch?division=${board.id}`
      : `/events/${eventId}/schedule?division=${board.id}`
  ) as Route;

  return (
    <section className="border-border-base bg-bg rounded-shape-md space-y-3 border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-fg text-title-lg truncate font-bold">{board.label}</h2>
        <StatusPill status={board.status} />
      </div>

      {board.total > 0 && <Progress done={board.done} total={board.total} />}

      {board.champion && (
        <p className="text-sm">
          <span className="text-muted">🏆 Champion: </span>
          <span className="text-fg font-semibold">{board.champion}</span>
        </p>
      )}

      {board.standings.length > 0 && <StandingsMini rows={board.standings} />}

      {board.live.length > 0 ? (
        <MatchMiniList label="Now playing" matches={board.live} live />
      ) : board.next.length > 0 && !board.champion ? (
        <MatchMiniList label="Up next" matches={board.next} />
      ) : null}

      <Link href={watchHref} className="text-primary text-xs hover:underline">
        {board.kind === 'tournament' ? 'View bracket →' : 'View schedule →'}
      </Link>
    </section>
  );
}

function StatusPill({ status }: { status: DivisionBoard['status'] }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold tracking-wide text-red-600 uppercase dark:text-red-400">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        Live
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="bg-md-success-container text-md-on-success-container rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
        Final
      </span>
    );
  }
  return (
    <span className="bg-fg/5 text-muted rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
      {status === 'setup' ? 'Setup' : 'Not started'}
    </span>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="text-muted mb-1 flex justify-between text-xs">
        <span>Matches</span>
        <span>
          {done}/{total} done
        </span>
      </div>
      <div className="bg-fg/10 h-1.5 w-full overflow-hidden rounded-full">
        <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StandingsMini({ rows }: { rows: DivisionStanding[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted text-left">
          <th scope="col" className="font-medium">
            #
          </th>
          <th scope="col" className="font-medium">
            Team
          </th>
          <th scope="col" className="text-right font-medium">
            W–L
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.rank} className="text-fg">
            <td className="text-muted py-0.5 pr-2">{r.rank}</td>
            <td className="truncate py-0.5">{r.name}</td>
            <td className="py-0.5 text-right tabular-nums">
              {r.wins}–{r.losses}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MatchMiniList({
  label,
  matches,
  live,
}: {
  label: string;
  matches: CourtMatch[];
  /** Render the in-progress box score under each row (live matches only). */
  live?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted text-[11px] font-semibold tracking-wide uppercase">{label}</p>
      <ul className="space-y-1">
        {matches.slice(0, 3).map((m) => (
          <li key={m.id} className="text-sm">
            <span className="text-fg">{m.teamA ?? 'TBD'}</span>
            <span className="text-muted mx-1.5 text-xs">vs</span>
            <span className="text-fg">{m.teamB ?? 'TBD'}</span>
            {m.court && <span className="text-muted ml-2 text-xs">· {m.court}</span>}
            {live && <LiveScore matchId={m.id} className="mt-1" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
