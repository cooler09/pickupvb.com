import Link from 'next/link';
import type { Route } from 'next';

export type TeamRosterMember = {
  userId: string;
  status: 'active' | 'pending';
  profile: {
    displayName: string;
    /** Vanity handle for the player profile link; '' when unknown. */
    handle: string;
  } | null;
};

type Props = {
  member: TeamRosterMember;
  isCaptain: boolean;
};

/** Display name for a roster member, falling back to a generic label. */
export function memberName(m: TeamRosterMember): string {
  return m.profile?.displayName || 'Player';
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Read-only roster row on the public team page. Captain removal lives in the
 * viewer-only `TeamViewerChrome` "Roster controls" island, not here — the
 * roster itself is server-rendered so the page stays ISR-cacheable.
 */
export function TeamMemberRow({ member, isCaptain }: Props) {
  const name = memberName(member);
  const isPending = member.status === 'pending';
  const handle = member.profile?.handle || member.userId;
  return (
    <li className="border-border-base bg-md-surface-container flex items-center justify-between gap-3 rounded-md border p-3">
      <Link
        href={`/players/${handle}` as Route}
        className="group flex min-w-0 items-center gap-3 hover:underline"
      >
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            isPending ? 'bg-fg/10 text-fg/60' : 'bg-primary/15 text-primary'
          }`}
        >
          {initials(name)}
        </span>
        <div className="min-w-0">
          <p className={`truncate text-sm font-medium ${isPending ? 'text-fg/70' : ''}`}>{name}</p>
          {isCaptain ? (
            <p className="text-primary text-xs font-semibold tracking-wide uppercase">Captain</p>
          ) : isPending ? (
            <p className="text-muted text-xs font-medium tracking-wide uppercase">Pending invite</p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
