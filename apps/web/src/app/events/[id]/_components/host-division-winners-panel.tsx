import type { DivisionLite } from '@pickupvb/domain';
import { primaryButtonClass } from '@/components/primary-button';
import { recordDivisionWinner, clearDivisionWinner } from '../record-division-winner-actions';

type EligibleTeamOption = {
  kind: 'team' | 'registration';
  id: string;
  label: string;
};

type Props = {
  eventId: string;
  returnPath: string;
  divisions: ReadonlyArray<DivisionLite>;
  eligibleTeamsByDivision: ReadonlyMap<string, ReadonlyArray<EligibleTeamOption>>;
};

/**
 * Host-only panel that lets the host pick a winning team per division and
 * record it (or clear a previously-recorded winner). Server component:
 * plain `<form action={...}>` submissions are bound to the host action.
 *
 * Eligible teams are sourced from both `event_teams` (roster mode, links to
 * `teams.name`) and `event_team_registrations` (ad-hoc tournaments). The
 * form value is encoded as `"<kind>:<uuid>"` so the action can route to the
 * correct `event_divisions.winner_*` column.
 */
export function HostDivisionWinnersPanel({
  eventId,
  returnPath,
  divisions,
  eligibleTeamsByDivision,
}: Props) {
  if (divisions.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-fg text-sm font-semibold">Division winners</h3>
      <ul className="space-y-3">
        {divisions.map((d) => {
          const eligible = eligibleTeamsByDivision.get(d.id) ?? [];
          return (
            <li
              key={d.id}
              className="border-border-base bg-surface space-y-2 rounded-md border p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-fg text-sm font-medium">{d.label}</span>
                {d.winner && (
                  <span className="text-muted text-xs">
                    Winner: <span className="text-fg">{d.winner.label}</span>
                  </span>
                )}
              </div>
              {d.winner ? (
                <form action={clearDivisionWinner.bind(null, eventId, d.id, returnPath)}>
                  <button
                    type="submit"
                    className="text-fg/80 hover:text-fg border-border-base rounded border px-3 py-1 text-xs"
                  >
                    Clear winner
                  </button>
                </form>
              ) : eligible.length === 0 ? (
                <p className="text-muted text-xs">No registered teams in this division yet.</p>
              ) : (
                <form
                  action={recordDivisionWinner.bind(null, eventId, d.id, returnPath)}
                  className="flex flex-wrap items-center gap-2"
                >
                  <label className="sr-only" htmlFor={`winner-${d.id}`}>
                    Winning team for {d.label}
                  </label>
                  <select
                    id={`winner-${d.id}`}
                    name="team"
                    required
                    defaultValue=""
                    className="border-border-base bg-bg text-fg rounded border px-2 py-1 text-sm"
                  >
                    <option value="" disabled>
                      Select a team…
                    </option>
                    {eligible.map((t) => (
                      <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
                        {t.label}
                        {t.kind === 'registration' ? ' (registration)' : ''}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={primaryButtonClass()}>
                    Record winner
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
