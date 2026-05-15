import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';
import { ProfileForm } from './profile-form';
import { FriendsList } from '@/components/friends-list';
import {
    HostedEventsList,
    loadVisibleHostedEvents,
} from '@/components/hosted-events-list';
import { MyGroupsSection, type MyGroup } from './_components/my-groups-section';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your profile — PickupVB' };

type ProfileRow = {
    first_name: string | null;
    last_name: string | null;
    display_name: string;
    home_city: string | null;
    auto_accept_team_invites: boolean | null;
    primary_position: string | null;
    secondary_position: string | null;
    tertiary_position: string | null;
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
    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/profile');

    const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, display_name, home_city, auto_accept_team_invites, primary_position, secondary_position, tertiary_position')
        .eq('id', user.id)
        .maybeSingle();

    const row = data as ProfileRow | null;
    const profile = {
        first_name: row?.first_name ?? null,
        last_name: row?.last_name ?? null,
        display_name: row?.display_name ?? user.email?.split('@')[0] ?? 'Player',
        home_city: row?.home_city ?? null,
        auto_accept_team_invites: row?.auto_accept_team_invites ?? false,
        primary_position: row?.primary_position ?? null,
        secondary_position: row?.secondary_position ?? null,
        tertiary_position: row?.tertiary_position ?? null,
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
    const groupsForSection: MyGroup[] = myGroups.map((r) => ({
        id: r.groups.id,
        slug: r.groups.slug,
        name: r.groups.name,
        avatarUrl: r.groups.avatar_url,
        homeCity: r.groups.home_city,
        role: r.role,
    }));

    // Outstanding team invites — surfaces in a callout near the top so the
    // user notices without having to navigate to /teams.
    const { data: pendingRows } = await supabase
        .from('team_members')
        .select('teams:teams!inner(id, name, format)')
        .eq('user_id', user.id)
        .eq('status', 'pending');
    type PendingRow = {
        teams: { id: string; name: string; format: string } | null;
    };
    const pendingInvites = ((pendingRows as PendingRow[] | null) ?? [])
        .map((r) => r.teams)
        .filter((t): t is NonNullable<PendingRow['teams']> => t !== null);

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

            {pendingInvites.length > 0 && (
                <section className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        Pending team invites ({pendingInvites.length})
                    </h2>
                    <ul className="space-y-2">
                        {pendingInvites.map((t) => (
                            <li key={t.id}>
                                <Link
                                    href={`/teams/${t.id}`}
                                    className="flex items-center justify-between gap-3 rounded-md border border-border-base bg-surface p-3 text-sm hover:border-primary/40"
                                >
                                    <span className="truncate font-medium">{t.name}</span>
                                    <span className="shrink-0 text-xs text-primary">
                                        Respond →
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

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

            <MyGroupsSection groups={groupsForSection} />

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
