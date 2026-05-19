import Link from 'next/link';
import type { RegisteredTeam } from './tournament-signup-panel';

type Props = {
  teams: ReadonlyArray<RegisteredTeam>;
};

/**
 * Read-only team roster for tournament pages. Mirrors the "Players signed
 * up" section on open-play pages so viewers can scan participants without
 * opening the signup form (and so the list stays visible after signups
 * close).
 */
export function TeamsRegisteredSection({ teams }: Props) {
  return (
    <section id="teams">
      <h2 className="text-fg mb-3 text-lg font-semibold">
        Teams registered <span className="text-muted text-sm font-normal">({teams.length})</span>
      </h2>
      {teams.length === 0 ? (
        <p className="border-border-base text-muted rounded-md border border-dashed p-4 text-center text-sm">
          No teams registered yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {teams.map((t) => (
            <li
              key={t.teamId}
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
        </ul>
      )}
    </section>
  );
}
