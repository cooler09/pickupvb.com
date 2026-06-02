import type { DivisionLite } from '@pickupvb/domain';
import { primaryButtonClass } from '@/components/primary-button';
import { recordDivisionPlacement, clearDivisionPlacement } from '../record-division-winner-actions';

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

type Placement = 'winner' | 'runner_up' | 'third';

const PLACES: ReadonlyArray<{ place: Placement; medal: string; label: string }> = [
  { place: 'winner', medal: '🥇', label: '1st' },
  { place: 'runner_up', medal: '🥈', label: '2nd' },
  { place: 'third', medal: '🥉', label: '3rd' },
];

/**
 * Host-only panel to record a division's full podium (1st / 2nd / 3rd). Each
 * place writes the matching `event_divisions.{winner,runner_up,third_place}_entry_id`
 * column. Server component: plain `<form action={...}>` bound to the host
 * placement actions.
 *
 * Eligible teams are sourced from both `event_teams` (roster mode) and
 * `event_team_registrations` (ad-hoc); the form value is `"<kind>:<uuid>"` so the
 * action resolves the canonical `event_team_entries.id`.
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
      <h3 className="text-fg text-sm font-semibold">Division podium</h3>
      <ul className="space-y-3">
        {divisions.map((d) => {
          const eligible = eligibleTeamsByDivision.get(d.id) ?? [];
          const currentOf: Record<Placement, string | null> = {
            winner: d.winner?.label ?? null,
            runner_up: d.runnerUp?.label ?? null,
            third: d.thirdPlace?.label ?? null,
          };
          return (
            <li
              key={d.id}
              className="border-border-base bg-surface space-y-2 rounded-md border p-3"
            >
              <span className="text-fg text-sm font-medium">{d.label}</span>
              <ul className="space-y-2">
                {PLACES.map(({ place, medal, label }) => {
                  const current = currentOf[place];
                  return (
                    <li key={place} className="flex flex-wrap items-center gap-2">
                      <span className="text-muted w-12 shrink-0 text-xs" aria-hidden>
                        {medal} {label}
                      </span>
                      {current ? (
                        <>
                          <span className="text-fg text-sm">{current}</span>
                          <form
                            action={clearDivisionPlacement.bind(
                              null,
                              eventId,
                              d.id,
                              place,
                              returnPath,
                            )}
                          >
                            <button
                              type="submit"
                              className="text-fg/70 hover:text-fg border-border-base rounded border px-2 py-0.5 text-xs"
                            >
                              Clear
                            </button>
                          </form>
                        </>
                      ) : eligible.length === 0 ? (
                        <span className="text-muted text-xs">No registered teams yet.</span>
                      ) : (
                        <form
                          action={recordDivisionPlacement.bind(
                            null,
                            eventId,
                            d.id,
                            place,
                            returnPath,
                          )}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <label className="sr-only" htmlFor={`placement-${d.id}-${place}`}>
                            {label} place team for {d.label}
                          </label>
                          <select
                            id={`placement-${d.id}-${place}`}
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
                          <button type="submit" className={primaryButtonClass('sm')}>
                            Record
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
