import Link from 'next/link';
import { FORMAT_LABEL } from '@/lib/enum-labels';

export type TeamCardData = {
  id: string;
  slug: string;
  name: string;
  format: string;
  captain_id: string;
};

export function TeamCard({
  team,
  role,
  captainName,
}: {
  team: TeamCardData;
  role: 'captain' | 'member' | 'pending' | 'public';
  captainName?: string | null;
}) {
  const badge =
    role === 'captain'
      ? { label: 'Captain', className: 'bg-primary/15 text-primary' }
      : role === 'pending'
        ? {
            label: 'Pending',
            className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
          }
        : role === 'member'
          ? { label: 'Member', className: 'bg-fg/10 text-fg/80' }
          : null;
  return (
    <li>
      <Link
        href={`/teams/${team.slug}`}
        className="border-border-base bg-surface hover:border-primary/40 rounded-shape-sm flex items-start justify-between gap-3 border p-3"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{team.name}</p>
          <p className="text-muted text-xs">
            {FORMAT_LABEL[team.format] ?? team.format}
            {captainName ? ` · Captain: ${captainName}` : ''}
          </p>
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
