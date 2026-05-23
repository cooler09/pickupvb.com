import Link from 'next/link';
import type { RegisteredTeam } from './tournament-signup-panel';
import type { AdHocTeamPublicEntry } from './ad-hoc-team-signup-panel';

type Division = { id: string; label: string };

type Props = {
  teams: ReadonlyArray<RegisteredTeam>;
  /**
   * Ad-hoc registrations (`event_team_registrations`) for tournaments
   * in `team_registration_mode = 'ad_hoc'`. These are tournament-scoped
   * — they don't have a `teams` row and so don't link anywhere — but
   * they still belong in the public roster.
   */
  adHocRegistrations?: ReadonlyArray<AdHocTeamPublicEntry>;
  /** Divisions on the event, used to resolve labels for ad-hoc rows. */
  divisions?: ReadonlyArray<Division>;
};

const PAYMENT_PILL: Record<AdHocTeamPublicEntry['paymentStatus'], { label: string; cls: string }> =
  {
    none: { label: 'Unpaid', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
    pending: { label: 'Pending', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
    paid: { label: 'Paid', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    refunded: { label: 'Refunded', cls: 'border-border-base bg-fg/5 text-muted' },
  };

/**
 * Read-only team roster for tournament pages. Mirrors the "Players signed
 * up" section on open-play pages so viewers can scan participants without
 * opening the signup form (and so the list stays visible after signups
 * close).
 */
export function TeamsRegisteredSection({ teams, adHocRegistrations = [], divisions = [] }: Props) {
  const divisionLabel = (id: string): string =>
    divisions.find((d) => d.id === id)?.label ?? 'Division';
  const total = teams.length + adHocRegistrations.length;
  return (
    <section id="teams">
      <h2 className="text-fg mb-3 text-lg font-semibold">
        Teams registered <span className="text-muted text-sm font-normal">({total})</span>
      </h2>
      {total === 0 ? (
        <p className="border-border-base text-muted rounded-md border border-dashed p-4 text-center text-sm">
          No teams registered yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {teams.map((t) => (
            <li
              key={`team-${t.teamId}`}
              className="border-border-base bg-surface flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/teams/${t.slug}`}
                  className="truncate text-sm font-semibold hover:underline"
                >
                  {t.name}
                </Link>
                <p className="text-muted text-xs">
                  Captain: {t.captain?.displayName ?? 'Unknown'} · {t.memberCount} player
                  {t.memberCount === 1 ? '' : 's'}
                </p>
              </div>
            </li>
          ))}
          {adHocRegistrations.map((r) => (
            <li
              key={`adhoc-${r.id}`}
              className="border-border-base bg-surface flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{r.name}</p>
                <p className="text-muted text-xs">
                  {divisionLabel(r.divisionId)} · {r.memberCount} player
                  {r.memberCount === 1 ? '' : 's'}
                </p>
              </div>
              <span
                className={`rounded-md border px-2 py-0.5 text-xs font-medium ${PAYMENT_PILL[r.paymentStatus].cls}`}
              >
                {PAYMENT_PILL[r.paymentStatus].label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
