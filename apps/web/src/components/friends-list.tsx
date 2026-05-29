import Image from 'next/image';
import Link from 'next/link';
import type { ProfileCard } from '@pickupvb/domain';
import { removeFriend } from '@/app/friends/actions';
import { SubmitButton } from '@/components/submit-button';

function initialsOf(p: ProfileCard): string {
  const parts = (p.displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (p.displayName ?? '?').slice(0, 2).toUpperCase();
}

function nameOf(p: ProfileCard): string {
  return p.displayName || 'Player';
}

export function FriendsList({
  friends,
  mutualIds,
  returnPath,
}: {
  friends: ProfileCard[];
  mutualIds: Set<string>;
  returnPath: string;
}) {
  if (friends.length === 0) {
    return (
      <p className="border-border-base text-muted rounded-lg border border-dashed p-4 text-sm">
        You aren&apos;t following any players yet. Open any{' '}
        <Link href="/events" className="text-primary font-medium hover:underline">
          event
        </Link>{' '}
        and tap <span className="text-fg font-medium">+ Follow</span> next to a player&apos;s name
        to see their upcoming events here.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {friends.map((p) => {
        const mutual = mutualIds.has(p.id);
        return (
          <li
            key={p.id}
            className="border-border-base flex items-center gap-3 rounded-lg border px-3 py-2"
          >
            <Link
              href={`/players/${p.handle}`}
              className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-90"
            >
              {p.avatarUrl ? (
                <Image
                  src={p.avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="bg-primary/15 text-primary flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
                >
                  {initialsOf(p)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-fg hover:text-primary truncate text-sm font-medium">
                    {nameOf(p)}
                  </span>
                  {mutual ? (
                    <span
                      className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
                      title="You both follow each other"
                    >
                      Mutual
                    </span>
                  ) : (
                    <span
                      className="bg-fg/5 text-fg/60 rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
                      title="They don't follow you back yet"
                    >
                      Following
                    </span>
                  )}
                </div>
                {p.homeCity && (
                  <span className="text-muted block truncate text-xs">{p.homeCity}</span>
                )}
              </div>
            </Link>
            <form action={removeFriend.bind(null, p.id, returnPath)}>
              <SubmitButton
                className="border-border-base text-fg/70 rounded-md border px-2 py-1 text-xs hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                title="Unfollow"
              >
                Unfollow
              </SubmitButton>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
