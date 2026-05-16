import Image from 'next/image';
import Link from 'next/link';
import { removeFriend } from '@/app/friends/actions';

type FriendProfile = {
    id: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    home_city: string | null;
};

function initialsOf(p: FriendProfile): string {
    const f = p.first_name?.trim()?.[0];
    const l = p.last_name?.trim()?.[0];
    if (f && l) return (f + l).toUpperCase();
    const parts = (p.display_name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return (p.display_name ?? '?').slice(0, 2).toUpperCase();
}

function nameOf(p: FriendProfile): string {
    const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    return full || p.display_name || 'Player';
}

export function FriendsList({
    friends,
    mutualIds,
    returnPath,
}: {
    friends: FriendProfile[];
    mutualIds: Set<string>;
    returnPath: string;
}) {
    if (friends.length === 0) {
        return (
            <p className="rounded-lg border border-dashed border-border-base p-4 text-sm text-muted">
                You aren&apos;t following any players yet. Open any{' '}
                <Link href="/events" className="font-medium text-primary hover:underline">
                    event
                </Link>{' '}
                and tap <span className="font-medium text-fg">+ Follow</span> next to
                a player&apos;s name to see their upcoming events here.
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
                        className="flex items-center gap-3 rounded-lg border border-border-base px-3 py-2"
                    >
                        <Link
                            href={`/players/${p.id}`}
                            className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-90"
                        >
                            {p.avatar_url ? (
                                <Image
                                    src={p.avatar_url}
                                    alt=""
                                    width={36}
                                    height={36}
                                    className="h-9 w-9 rounded-full object-cover"
                                />
                            ) : (
                                <span
                                    aria-hidden="true"
                                    className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                                >
                                    {initialsOf(p)}
                                </span>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium text-fg hover:text-primary">
                                        {nameOf(p)}
                                    </span>
                                    {mutual ? (
                                        <span
                                            className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
                                            title="You both follow each other"
                                        >
                                            Mutual
                                        </span>
                                    ) : (
                                        <span
                                            className="rounded-full bg-fg/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg/60"
                                            title="They don't follow you back yet"
                                        >
                                            Following
                                        </span>
                                    )}
                                </div>
                                {p.home_city && (
                                    <span className="block truncate text-xs text-muted">
                                        {p.home_city}
                                    </span>
                                )}
                            </div>
                        </Link>
                        <form action={removeFriend.bind(null, p.id, returnPath)}>
                            <button
                                type="submit"
                                className="rounded-md border border-border-base px-2 py-1 text-xs text-fg/70 hover:bg-red-50 hover:text-red-700"
                                title="Unfollow"
                            >
                                Unfollow
                            </button>
                        </form>
                    </li>
                );
            })}
        </ul>
    );
}
