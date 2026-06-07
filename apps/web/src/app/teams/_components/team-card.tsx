import Link from 'next/link';

export type TeamCardData = {
  id: string;
  slug: string;
  name: string;
  captain_id: string;
};

export function TeamCard({
  team,
  role,
  captainName,
  rosterCount,
}: {
  team: TeamCardData;
  role: 'captain' | 'member' | 'pending' | 'public';
  captainName?: string | null;
  /** Active roster size (+ off-site extras) — how many players are on the roster. */
  rosterCount?: number;
}) {
  const showRoster = typeof rosterCount === 'number';
  const badge =
    role === 'captain'
      ? { label: 'Captain', className: 'bg-primary/15 text-primary' }
      : role === 'pending'
        ? {
            label: 'Pending',
            className: 'bg-md-warning/15 text-md-warning',
          }
        : role === 'member'
          ? { label: 'Member', className: 'bg-fg/10 text-fg/80' }
          : null;
  return (
    <li>
      <Link
        href={`/teams/${team.slug}`}
        className="border-border-base bg-md-surface-container hover:border-primary/40 rounded-shape-sm flex items-start justify-between gap-3 border p-3"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{team.name}</p>
          {captainName && <p className="text-muted text-xs">Captain: {captainName}</p>}
          {showRoster && (
            <p className="mt-1 text-[11px]">
              <span className="bg-fg/10 text-muted rounded px-1.5 py-0.5">
                {rosterCount} {rosterCount === 1 ? 'player' : 'players'}
              </span>
            </p>
          )}
        </div>
        {badge && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
        )}
      </Link>
    </li>
  );
}
