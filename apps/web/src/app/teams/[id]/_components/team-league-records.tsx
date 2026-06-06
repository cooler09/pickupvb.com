import Link from 'next/link';
import type { TeamLeagueRecord } from '../_loaders/load-team-league-records';

/**
 * Read-only "League records" section on the team profile (Phase 3 of the
 * leagues container-model work). Server-rendered and viewer-independent, so it
 * sits in the cacheable team page outside any client island. Renders nothing
 * when the team has no league history.
 */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function TeamLeagueRecords({ records }: { records: ReadonlyArray<TeamLeagueRecord> }) {
  if (records.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">League records</h2>
      <ul className="space-y-2">
        {records.map((r) => (
          <li key={r.eventId} className="border-border-base bg-bg rounded border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/events/${r.eventId}`} className="text-fg font-medium hover:underline">
                  {r.eventTitle}
                </Link>
                <p className="text-muted text-xs">
                  {r.divisionLabel} · {r.seasonLabel}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                  r.state === 'final'
                    ? 'bg-fg/10 text-muted'
                    : 'bg-green-500/10 text-green-700 dark:text-green-300'
                }`}
              >
                {r.state === 'final' ? 'Final' : 'In progress'}
              </span>
            </div>
            <div className="text-fg mt-2 flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-mono tabular-nums">
                {r.wins}–{r.losses}
              </span>
              {r.rank !== null ? (
                <span className="text-muted text-xs">
                  {ordinal(r.rank)} of {r.totalTeams}
                </span>
              ) : (
                <span className="text-muted text-xs">No results yet</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
