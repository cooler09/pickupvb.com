import type { CourtBoard, CourtColumn, CourtMatch } from '../../_lib/court-board';

/**
 * Presentational court board (tournament-displays slice B). Server component —
 * the live-ness comes from the page's realtime refreshers re-rendering it, not
 * from any client state here. Point-by-point live scores are a deliberate
 * follow-up (they'd need a cross-division live-score subscription); v1 surfaces
 * the pairing + LIVE / Up-next status, which is the core "where do I go" value.
 */
export function CourtBoardView({ board }: { board: CourtBoard }) {
  const empty =
    board.courts.length === 0 &&
    board.unassignedNow.length === 0 &&
    board.unassignedNext.length === 0;

  if (empty) {
    return (
      <div className="border-border-base bg-bg rounded-shape-sm border p-6 text-center">
        <p className="text-fg/80 text-sm">
          No matches are scheduled yet. Once the bracket or schedule is live, courts appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {board.hasCourts && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {board.courts.map((col) => (
            <CourtCard key={col.court} col={col} />
          ))}
        </div>
      )}

      {(board.unassignedNow.length > 0 || board.unassignedNext.length > 0) && (
        <UnassignedSection
          now={board.unassignedNow}
          next={board.unassignedNext}
          hasCourts={board.hasCourts}
        />
      )}
    </div>
  );
}

function CourtCard({ col }: { col: CourtColumn }) {
  return (
    <section className="border-border-base bg-bg rounded-shape-md space-y-3 border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-fg text-title-lg font-bold">{col.court}</h2>
        {col.now ? <LiveBadge /> : <span className="text-muted text-xs">Open</span>}
      </div>

      {col.now ? (
        <MatchLine m={col.now} emphasis />
      ) : (
        <p className="text-muted text-sm">No match in progress.</p>
      )}

      <div className="border-border-base border-t pt-3">
        <p className="text-muted mb-1 text-[11px] font-semibold tracking-wide uppercase">Up next</p>
        {col.next ? <MatchLine m={col.next} /> : <p className="text-muted text-sm">—</p>}
        {col.laterCount > 0 && (
          <p className="text-muted mt-1 text-xs">+{col.laterCount} more queued</p>
        )}
      </div>
    </section>
  );
}

function UnassignedSection({
  now,
  next,
  hasCourts,
}: {
  now: CourtMatch[];
  next: CourtMatch[];
  hasCourts: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-fg text-title-lg font-bold">
        {hasCourts ? 'Not on a court' : 'Now & next'}
      </h2>
      {now.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted text-[11px] font-semibold tracking-wide uppercase">
            Now playing
          </p>
          <ul className="space-y-2">
            {now.map((m) => (
              <li key={m.id} className="border-border-base bg-bg rounded-shape-sm border p-3">
                <MatchLine m={m} emphasis />
              </li>
            ))}
          </ul>
        </div>
      )}
      {next.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted text-[11px] font-semibold tracking-wide uppercase">Up next</p>
          <ul className="space-y-2">
            {next.slice(0, 8).map((m) => (
              <li key={m.id} className="border-border-base bg-bg rounded-shape-sm border p-3">
                <MatchLine m={m} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function MatchLine({ m, emphasis }: { m: CourtMatch; emphasis?: boolean }) {
  return (
    <div>
      <div className={`text-fg font-semibold ${emphasis ? 'text-headline-sm' : 'text-base'}`}>
        <span>{m.teamA ?? 'TBD'}</span>
        <span className="text-muted mx-2 font-normal">vs</span>
        <span>{m.teamB ?? 'TBD'}</span>
      </div>
      <p className="text-muted mt-0.5 text-xs">
        {m.divisionLabel} · {m.stageLabel}
      </p>
    </div>
  );
}

function LiveBadge() {
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
