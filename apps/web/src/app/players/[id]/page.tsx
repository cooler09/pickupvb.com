import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';
import {
    HostedEventsList,
    loadVisibleHostedEvents,
} from '@/components/hosted-events-list';
import { addFriend, removeFriend } from '@/app/friends/actions';

export const dynamic = 'force-dynamic';

type PlayerProfile = {
    id: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    home_city: string | null;
};

function initialsOf(p: PlayerProfile): string {
    const f = p.first_name?.trim()?.[0];
    const l = p.last_name?.trim()?.[0];
    if (f && l) return (f + l).toUpperCase();
    const parts = (p.display_name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return (p.display_name ?? '?').slice(0, 2).toUpperCase();
}

function nameOf(p: PlayerProfile): string {
    const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    return full || p.display_name || 'Player';
}

export async function generateMetadata({ params }: { params: { id: string } }) {
    const supabase = getServerSupabase();
    const { data } = await supabase
        .from('profiles')
        .select('display_name, first_name, last_name')
        .eq('id', params.id)
        .maybeSingle();
    const p = data as PlayerProfile | null;
    const name = p ? nameOf({ ...p, id: params.id, avatar_url: null, home_city: null }) : 'Player';
    return { title: `${name} — PickupVB` };
}

export default async function PlayerProfilePage({ params }: { params: { id: string } }) {
    const supabase = getServerSupabase();

    const { data: profileRow } = await supabase
        .from('profiles')
        .select('id, display_name, first_name, last_name, avatar_url, home_city')
        .eq('id', params.id)
        .maybeSingle();

    const profile = profileRow as PlayerProfile | null;
    if (!profile) notFound();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const isSelf = user?.id === profile.id;

    let isFollowing = false;
    if (user && !isSelf) {
        const { data: edge } = await supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', user.id)
            .eq('friend_id', profile.id)
            .maybeSingle();
        isFollowing = Boolean(edge);
    }

    // RLS handles visibility — viewer only sees events they're allowed to.
    const events = await loadVisibleHostedEvents(profile.id);
    const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= Date.now());
    const past = events.filter((e) => new Date(e.starts_at).getTime() < Date.now());

    const returnPath = `/players/${profile.id}`;
    const name = nameOf(profile);

    return (
        <div className="mx-auto max-w-2xl space-y-8 py-4">
            <header className="flex items-center gap-4">
                {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={profile.avatar_url}
                        alt=""
                        className="h-16 w-16 rounded-full object-cover"
                    />
                ) : (
                    <span
                        aria-hidden="true"
                        className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-lg font-semibold text-primary"
                    >
                        {initialsOf(profile)}
                    </span>
                )}
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold text-fg">{name}</h1>
                    {profile.home_city && (
                        <p className="text-sm text-muted">{profile.home_city}</p>
                    )}
                </div>
                {!isSelf && (
                    user ? (
                        isFollowing ? (
                            <form action={removeFriend.bind(null, profile.id, returnPath)}>
                                <button
                                    type="submit"
                                    className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                                >
                                    ✓ Following
                                </button>
                            </form>
                        ) : (
                            <form action={addFriend.bind(null, profile.id, returnPath)}>
                                <button
                                    type="submit"
                                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                                >
                                    + Follow
                                </button>
                            </form>
                        )
                    ) : (
                        <Link
                            href={`/login?next=${encodeURIComponent(returnPath)}`}
                            className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                        >
                            Sign in to follow
                        </Link>
                    )
                )}
                {isSelf && (
                    <Link
                        href="/profile"
                        className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                    >
                        Edit profile
                    </Link>
                )}
            </header>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-fg">
                    Upcoming events{' '}
                    <span className="text-sm font-normal text-muted">({upcoming.length})</span>
                </h2>
                <HostedEventsList
                    events={upcoming}
                    emptyState={
                        isSelf
                            ? "You aren't hosting any upcoming events yet."
                            : `${name} isn't hosting any upcoming events you can see.`
                    }
                />
            </section>

            {past.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold text-fg">
                        Past events{' '}
                        <span className="text-sm font-normal text-muted">({past.length})</span>
                    </h2>
                    <HostedEventsList events={past} emptyState="" />
                </section>
            )}
        </div>
    );
}
