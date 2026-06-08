import type { DivisionLite } from '@pickupvb/domain';
import {
  markLeagueTeamForfeitedFromForm,
  reinstateLeagueTeamFromForm,
} from '../league-team-actions';
import type { LeagueTeamView } from '../_loaders/load-event-detail';

type Props = {
  eventId: string;
  returnPath: string;
  divisions: ReadonlyArray<DivisionLite>;
  teamsByDivision: ReadonlyMap<string, ReadonlyArray<LeagueTeamView>>;
};

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/**
 * Host-only panel listing every rostered team per division in a league
 * event, with a "Mark forfeited" / "Reinstate" toggle. Setting the flag
 * stamps `event_team_entries.forfeited_at`; clearing it nulls the column.
 * Downstream schedule generation will filter on the flag once
 * LeagueSchedule generation lands (deferred follow-up, audit P2 #7).
 */
export function LeagueTeamsPanel({ eventId, returnPath, divisions, teamsByDivision }: Props) {
  if (divisions.length === 0) return null;
  const anyTeams = divisions.some((d) => (teamsByDivision.get(d.id) ?? []).length > 0);
  return (
    <section className="space-y-3">
      <h3 className="text-fg text-sm font-semibold">League teams</h3>
      {!anyTeams ? (
        <p className="text-muted text-xs">No rostered teams in any division yet.</p>
      ) : (
        <ul className="space-y-3">
          {divisions.map((d) => {
            const teams = teamsByDivision.get(d.id) ?? [];
            return (
              <li
                key={d.id}
                className="border-border-base bg-md-surface-container space-y-2 rounded-md border p-3"
              >
                <div className="text-fg text-sm font-medium">{d.label}</div>
                {teams.length === 0 ? (
                  <p className="text-muted text-xs">No rostered teams yet.</p>
                ) : (
                  <ul className="divide-border-base divide-y">
                    {teams.map((t) => (
                      <li
                        key={t.entryId}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-fg text-sm">{t.name}</span>
                          {t.forfeitedAt && (
                            <span className="bg-bg text-muted border-border-base inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                              Forfeited{' '}
                              <span className="text-fg/80">{dateFmt.format(t.forfeitedAt)}</span>
                            </span>
                          )}
                        </div>
                        {t.forfeitedAt ? (
                          <form
                            action={reinstateLeagueTeamFromForm.bind(
                              null,
                              eventId,
                              d.id,
                              t.entryId,
                              returnPath,
                            )}
                          >
                            <button
                              type="submit"
                              className="text-fg/80 hover:text-fg border-border-base rounded border px-3 py-1 text-xs"
                            >
                              Reinstate
                            </button>
                          </form>
                        ) : (
                          <form
                            action={markLeagueTeamForfeitedFromForm.bind(
                              null,
                              eventId,
                              d.id,
                              t.entryId,
                              returnPath,
                            )}
                          >
                            <button
                              type="submit"
                              className="text-fg/80 hover:text-fg border-border-base rounded border px-3 py-1 text-xs"
                            >
                              Mark forfeited
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
