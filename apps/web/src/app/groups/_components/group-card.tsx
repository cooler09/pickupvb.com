import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

export type GroupCardData = {
  slug: string;
  name: string;
  avatarUrl: string | null;
  homeCity: string | null;
  region: string | null;
  description?: string | null;
  /** Directory social-proof chip; omitted (home peek, "my groups") → no chip. */
  memberCount?: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

/**
 * Shared group tile for the `/groups` directory and the home-page peek
 * (G-5 / home-page-ux H-4) — one component so the two stop drifting. Renders
 * the `<li>` (the parent owns the `<ul>` grid) as a whole-tile stretched link;
 * an optional `action` slot (e.g. a follow button) sits above the overlay and
 * captures its own click.
 */
export function GroupCard({ group, action }: { group: GroupCardData; action?: ReactNode }) {
  const location = [group.homeCity, group.region].filter(Boolean).join(', ');
  const hasCount = typeof group.memberCount === 'number';
  const memberLabel = hasCount
    ? `${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'}`
    : '';
  return (
    <li className="card-lift border-border-base bg-md-surface-container hover:border-primary/40 focus-within:ring-primary/40 rounded-shape-sm relative flex items-start gap-3 border p-3 focus-within:ring-2">
      {group.avatarUrl ? (
        <Image
          src={group.avatarUrl}
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="bg-primary/15 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
        >
          {initials(group.name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Link
          href={`/groups/${group.slug}` as Route}
          className="hover:text-primary block truncate text-sm font-semibold after:absolute after:inset-0 focus-visible:outline-none"
        >
          {group.name}
        </Link>
        {(location || hasCount) && (
          <p className="text-muted truncate text-xs">
            {[location, memberLabel].filter(Boolean).join(' · ')}
          </p>
        )}
        {group.description && (
          <p className="text-fg/80 mt-1 line-clamp-2 text-xs">{group.description}</p>
        )}
      </div>
      {action}
    </li>
  );
}
