import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';
import { ProfileForm } from './profile-form';
import { FriendsList } from '@/components/friends-list';
import {
    HostedEventsList,
    loadVisibleHostedEvents,
} from '@/components/hosted-events-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your profile — PickupVB' };

type ProfileRow = {
    first_name: string | null;
    last_name: string | null;
    display_name: string;
    home_city: string | null;
};

type FriendProfile = {
    id: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    home_city: string | null;
};

export default async function ProfilePage() {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/profile');

    const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, display_name, home_city')
        .eq('id', user.id)
        .maybeSingle();

    const profile: ProfileRow = (data as ProfileRow | null) ?? {
        first_name: null,
        last_name: null,
        display_name: user.email?.split('@')[0] ?? 'Player',
        home_city: null,
    };

    // Outgoing friend edges (people you've added).
    const { data: outRows } = await supabase
        .from('friendships')
        .select('friend_id, profiles:profiles!friendships_friend_id_fkey(id, display_name, first_name, last_name, avatar_url, home_city)')
        .eq('user_id', user.id);

    type OutRow = { friend_id: string; profiles: FriendProfile | null };
    const out = (outRows as OutRow[] | null) ?? [];
    const friends: FriendProfile[] = out
        .map((r) => r.profiles)
        .filter((p): p is FriendProfile => p !== null);

    // Incoming edges (people who've added you) → used to flag mutual friendships.
    // RLS only lets you see rows where user_id = auth.uid(), so we ask for rows
    // where friend_id = us; per policy you can also see those because they are
    // your inbound edges if the policy allows. If not, this will simply return
    // an empty list and "mutual" badges won't appear — graceful degradation.
    const { data: inRows } = await supabase
        .from('friendships')
        .select('user_id')
        .eq('friend_id', user.id);
    const mutualIds = new Set(
        ((inRows as { user_id: string }[] | null) ?? []).map((r) => r.user_id),
    );

    const hostedEvents = await loadVisibleHostedEvents(user.id);
    const upcomingHosted = hostedEvents.filter(
        (e) => new Date(e.starts_at).getTime() >= Date.now(),
    );

    // Groups the user is a member of (with role).
    const { data: myGroupRows } = await supabase
        .from('group_members')
        .select('role, groups:groups!inner(id, slug, name, avatar_url, home_city)')
        .eq('user_id', user.id);
    type MyGroupRow = {
        role: 'owner' | 'admin' | 'member';
        groups: {
            id: string;
            slug: string;
            name: string;
            avatar_url: string | null;
            home_city: string | null;
        } | null;
    };
    const myGroups = ((myGroupRows as MyGroupRow[] | null) ?? []).filter(
        (r): r is MyGroupRow & { groups: NonNullable<MyGroupRow['groups']> } => r.groups !== null,
    );

    return (
        <div className="mx-auto max-w-xl space-y-10 py-4">
            <section className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                        <h1 className="text-2xl font-bold">Your profile</h1>
                        <p className="text-sm text-fg/70">
                            This info shows up on events you join or host.
                        </p>
                    </div>
                    <Link
                        href={`/players/${user.id}`}
                        className="shrink-0 rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                    >
                        View public profile
                    </Link>
                </div>
                <ProfileForm profile={profile} email={user.email ?? ''} />
            </section>

            <section className="space-y-4">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-xl font-bold">
                        Hosting{' '}
                        <span className="text-sm font-normal text-muted">
                            ({upcomingHosted.length} upcoming)
                        </span>
                    </h2>
                    <Link
                        href="/events/new"
                        className="text-sm font-medium text-primary hover:underline"
                    >
                        + New event
                    </Link>
                </div>
                <HostedEventsList
                    events={upcomingHosted}
                    emptyState="You aren't hosting any upcoming events. Tap + New event to create one."
                />
            </section>

            <section className="space-y-4">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-xl font-bold">
                        Groups{' '}
                        <span className="text-sm font-normal text-muted">({myGroups.length})</span>
                    </h2>
                    <Link
                        href="/groups/new"
                        className="text-sm font-medium text-primary hover:underline"
                    >
                        + New group
                    </Link>
                </div>
                {myGroups.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border-base p-4 text-sm text-muted">
                        You aren&apos;t a member of any groups yet.{' '}
                        <Link href="/groups" className="text-primary hover:underline">
                            Browse groups
                        </Link>{' '}
                        or create one.
                    </p>
                ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {myGroups.map((g) => (
                            <li key={g.groups.id}>
                                <Link
                                    href={`/groups/${g.groups.id}`}
                                    className="flex items-center gap-3 rounded-lg border border-border-base bg-surface p-2 hover:border-primary/40"
                                >
                                    {g.groups.avatar_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={g.groups.avatar_url}
                                            alt=""
                                            className="h-9 w-9 rounded-md object-cover"
                                        />
                                    ) : (
                                        <span
                                            aria-hidden="true"
                                            className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary"
                                        >
                                            {g.groups.name.slice(0, 2).toUpperCase()}
                                        </span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{g.groups.name}</p>
                                        <p className="text-[10px] uppercase tracking-wide text-muted">
                                            {g.role}
                                        </p>
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="space-y-4">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-xl font-bold">
                        Following{' '}
                        <span className="text-sm font-normal text-muted">
                            ({friends.length})
                        </span>
                    </h2>
                </div>
                <FriendsList
                    friends={friends}
                    mutualIds={mutualIds}
                    returnPath="/profile"
                />
            </section>
        </div>
    );
}
