import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { FriendsList } from '@/components/friends-list';
import { AddFriendForm } from './_components/add-friend-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Following — PickupVB' };

type FriendProfile = {
    id: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    home_city: string | null;
};

export default async function FriendsPage() {
    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/friends');

    const { data: outRows } = await supabase
        .from('friendships')
        .select(
            'friend_id, profiles:profiles!friendships_friend_id_fkey(id, display_name, first_name, last_name, avatar_url, home_city)',
        )
        .eq('user_id', user.id);
    type OutRow = { friend_id: string; profiles: FriendProfile | null };
    const out = (outRows as OutRow[] | null) ?? [];
    const friends: FriendProfile[] = out
        .map((r) => r.profiles)
        .filter((p): p is FriendProfile => p !== null);

    const { data: inRows } = await supabase
        .from('friendships')
        .select('user_id')
        .eq('friend_id', user.id);
    const mutualIds = new Set(
        ((inRows as { user_id: string }[] | null) ?? []).map((r) => r.user_id),
    );

    // Hide the viewer + everyone they already follow from the picker.
    const excludeIds = [user.id, ...friends.map((f) => f.id)];

    return (
        <div className="mx-auto max-w-2xl space-y-6 py-4">
            <header>
                <h1 className="text-2xl font-bold">Following</h1>
                <p className="text-sm text-muted">
                    Players you follow show up in your activity feed and friend filters.
                </p>
            </header>

            <AddFriendForm returnPath="/friends" excludeIds={excludeIds} />

            <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                    Following ({friends.length})
                </h2>
                <FriendsList friends={friends} mutualIds={mutualIds} returnPath="/friends" />
            </section>
        </div>
    );
}
