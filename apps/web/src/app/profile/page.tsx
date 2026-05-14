import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { ProfileForm } from './profile-form';
import { FriendsList } from '@/components/friends-list';

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

    return (
        <div className="mx-auto max-w-xl space-y-10 py-4">
            <section className="space-y-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold">Your profile</h1>
                    <p className="text-sm text-fg/70">
                        This info shows up on events you join or host.
                    </p>
                </div>
                <ProfileForm profile={profile} email={user.email ?? ''} />
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
