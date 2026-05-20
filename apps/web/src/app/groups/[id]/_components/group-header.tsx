import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { followGroup, unfollowGroup } from '@/app/groups/actions';
import { ShareLink } from '@/components/share-link';

type Props = {
  group: {
    id: string;
    slug: string;
    name: string;
    description: string;
    avatarUrl: string | null;
    homeCity: string | null;
    region: string | null;
  };
  /** Owner/admin: shows Edit + Host event actions. */
  canManage: boolean;
  /** Whether a viewer is signed in (controls follow vs sign-in CTA). */
  isSignedIn: boolean;
  isFollowing: boolean;
  /** Where to send the user after follow/unfollow (revalidates this path). */
  returnPath: string;
  /** Inline stats shown next to the group name. */
  stats: {
    members: number;
    upcoming: number;
  };
};

/**
 * Top-of-page header for a group profile. Renders as a card with an
 * avatar, identity line, quick stats, description, and a row of viewer
 * actions (Follow / Share / Edit / Host event).
 */
export function GroupHeader({
  group,
  canManage,
  isSignedIn,
  isFollowing,
  returnPath,
  stats,
}: Props) {
  const place = [group.homeCity, group.region].filter(Boolean).join(', ');
  return (
    <header className="border-border-base bg-surface space-y-5 rounded-lg border p-5 sm:p-6">
      <div className="flex items-start gap-4">
        {group.avatarUrl ? (
          <Image
            src={group.avatarUrl}
            alt=""
            width={88}
            height={88}
            className="h-20 w-20 shrink-0 rounded-lg object-cover sm:h-22 sm:w-22"
          />
        ) : (
          <span
            aria-hidden="true"
            className="bg-primary/15 text-primary flex h-20 w-20 shrink-0 items-center justify-center rounded-lg text-xl font-semibold"
          >
            {group.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-fg text-2xl font-bold">{group.name}</h1>
          <p className="text-muted text-xs">@{group.slug}</p>
          {place && <p className="text-muted text-sm">{place}</p>}
          <p className="text-muted pt-1 text-xs">
            <strong className="text-fg">{stats.members}</strong>{' '}
            {stats.members === 1 ? 'member' : 'members'}
            <span className="mx-1.5">·</span>
            <strong className="text-fg">{stats.upcoming}</strong> upcoming{' '}
            {stats.upcoming === 1 ? 'event' : 'events'}
          </p>
        </div>
      </div>

      {group.description && (
        <p className="text-fg/90 text-sm whitespace-pre-wrap">{group.description}</p>
      )}

      <div className="border-border-base flex flex-wrap items-center gap-2 border-t pt-4">
        {isSignedIn ? (
          isFollowing ? (
            <form action={unfollowGroup.bind(null, group.id, returnPath)}>
              <button
                type="submit"
                className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm font-medium"
              >
                ✓ Following
              </button>
            </form>
          ) : (
            <form action={followGroup.bind(null, group.id, returnPath)}>
              <button
                type="submit"
                className="bg-primary hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium text-white"
              >
                + Follow
              </button>
            </form>
          )
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(returnPath)}`}
            className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm"
          >
            Sign in to follow
          </Link>
        )}
        <ShareLink path={`/groups/${group.slug}`} title={group.name} />
        {canManage && (
          <>
            <Link
              href={'/events/new' as Route}
              className="border-primary/40 text-primary hover:bg-primary/5 ml-auto rounded-md border px-3 py-1.5 text-sm font-medium"
            >
              Host an event
            </Link>
            <Link
              href={`/groups/${group.slug}/edit` as Route}
              className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm"
            >
              Edit
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
