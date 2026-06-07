import Link from 'next/link';
import type { RegisteredTeam } from './tournament-signup-panel';
import type { AdHocTeamPublicEntry } from './ad-hoc-team-signup-panel';

type Division = { id: string; label: string };

type Props = {
  teams: ReadonlyArray<RegisteredTeam>;
  /**
   * Ad-hoc registrations (`event_team_registrations`) for divisions
   * with `team_registration_mode = 'ad_hoc'` (ADR 0016). These are
   * tournament-scoped — they don't have a `teams` row and so don't
   * link anywhere — but they still belong in the public roster.
   */
  adHocRegistrations?: ReadonlyArray<AdHocTeamPublicEntry>;
  /** Divisions on the event, used to resolve labels for ad-hoc rows. */
  divisions?: ReadonlyArray<Division>;
};

const PAYMENT_PILL: Record<AdHocTeamPublicEntry['paymentStatus'], { label: string; cls: string }> =
  {
    none: {
      label: 'Unpaid',
      cls: 'border-md-warning/30 bg-md-warning-container text-md-on-warning-container',
    },
    pending: {
      label: 'Pending',
      cls: 'border-md-warning/30 bg-md-warning-container text-md-on-warning-container',
    },
    paid: {
      label: 'Paid',
      cls: 'border-md-success/30 bg-md-success-container text-md-on-success-container',
    },
    refunded: { label: 'Refunded', cls: 'border-border-base bg-fg/5 text-muted' },
  };

function RosterTeamRow({ team }: { team: RegisteredTeam }) {
  return (
    <li className="border-border-base bg-surface flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <Link
          href={`/teams/${team.slug}`}
          className="truncate text-sm font-semibold hover:underline"
        >
          {team.name}
        </Link>
        <p className="text-muted text-xs">
          Captain: {team.captain?.displayName ?? 'Unknown'} · {team.memberCount} player
          {team.memberCount === 1 ? '' : 's'}
        </p>
      </div>
    </li>
  );
}

function AdHocTeamRow({ reg }: { reg: AdHocTeamPublicEntry }) {
  const rosterSize = 1 + reg.members.length;
  const captainLabel = reg.captainName ?? 'Captain';
  return (
    <li className="border-border-base bg-surface rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{reg.name}</p>
          <p className="text-muted text-xs">
            Captain: {captainLabel} · {rosterSize} player
            {rosterSize === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {reg.source === 'walk_in' && (
            <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
              Added by host
            </span>
          )}
          <span
            className={`rounded-md border px-2 py-0.5 text-xs font-medium ${PAYMENT_PILL[reg.paymentStatus].cls}`}
          >
            {PAYMENT_PILL[reg.paymentStatus].label}
          </span>
        </div>
      </div>
      {rosterSize > 1 && (
        <details className="group mt-2">
          <summary className="text-muted hover:text-fg cursor-pointer text-xs font-medium select-none">
            <span className="group-open:hidden">Show roster</span>
            <span className="hidden group-open:inline">Hide roster</span>
          </summary>
          <ul className="border-border-base mt-2 space-y-1 border-l pl-3 text-sm">
            <li className="text-fg">
              {captainLabel} <span className="text-muted text-xs">(captain)</span>
            </li>
            {reg.members.map((m) => (
              <li key={m.id} className="text-fg truncate">
                {m.displayName}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

/**
 * Read-only team roster for tournament pages. Mirrors the "Players signed
 * up" section on open-play pages so viewers can scan participants without
 * opening the signup form (and so the list stays visible after signups
 * close).
 *
 * When the event has more than one division, rows are grouped under a
 * sub-heading per division so viewers can see who's in each bracket
 * without scanning a flat list. Single-division events stay flat — the
 * sub-heading would just repeat what `EventHero` already shows.
 */
export function TeamsRegisteredSection({ teams, adHocRegistrations = [], divisions = [] }: Props) {
  const total = teams.length + adHocRegistrations.length;
  const groupByDivision = divisions.length > 1;

  return (
    <section id="teams">
      <h2 className="text-fg mb-3 text-lg font-semibold">
        Teams registered <span className="text-muted text-sm font-normal">({total})</span>
      </h2>
      {total === 0 ? (
        <p className="border-border-base text-muted rounded-md border border-dashed p-4 text-center text-sm">
          No teams registered yet.
        </p>
      ) : groupByDivision ? (
        <div className="space-y-6">
          {divisions.map((d) => {
            const divTeams = teams.filter((t) => t.divisionId === d.id);
            const divAdHoc = adHocRegistrations.filter((r) => r.divisionId === d.id);
            const divTotal = divTeams.length + divAdHoc.length;
            return (
              <div key={d.id}>
                <h3 className="text-fg mb-2 text-sm font-semibold">
                  {d.label} <span className="text-muted text-xs font-normal">({divTotal})</span>
                </h3>
                {divTotal === 0 ? (
                  <p className="border-border-base text-muted rounded-md border border-dashed p-3 text-center text-xs">
                    No teams in this division yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {divTeams.map((t) => (
                      <RosterTeamRow key={`team-${t.teamId}`} team={t} />
                    ))}
                    {divAdHoc.map((r) => (
                      <AdHocTeamRow key={`adhoc-${r.id}`} reg={r} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {/* Defensive: surface rows whose divisionId doesn't match any known
              division (stale data, race with division delete). Without this
              they'd silently disappear from the public roster. */}
          {(() => {
            const knownIds = new Set(divisions.map((d) => d.id));
            const orphanTeams = teams.filter((t) => !t.divisionId || !knownIds.has(t.divisionId));
            const orphanAdHoc = adHocRegistrations.filter((r) => !knownIds.has(r.divisionId));
            if (orphanTeams.length + orphanAdHoc.length === 0) return null;
            return (
              <div>
                <h3 className="text-muted mb-2 text-sm font-semibold">Other</h3>
                <ul className="space-y-2">
                  {orphanTeams.map((t) => (
                    <RosterTeamRow key={`team-${t.teamId}`} team={t} />
                  ))}
                  {orphanAdHoc.map((r) => (
                    <AdHocTeamRow key={`adhoc-${r.id}`} reg={r} />
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
      ) : (
        <ul className="space-y-2">
          {teams.map((t) => (
            <RosterTeamRow key={`team-${t.teamId}`} team={t} />
          ))}
          {adHocRegistrations.map((r) => (
            <AdHocTeamRow key={`adhoc-${r.id}`} reg={r} />
          ))}
        </ul>
      )}
    </section>
  );
}
