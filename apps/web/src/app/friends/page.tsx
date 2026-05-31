import { redirect } from 'next/navigation';
import { SupabaseSocialGraphRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';
import { FriendsList } from '@/components/friends-list';
import { AddFriendForm } from './_components/add-friend-form';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Following — PickupVB',
  robots: { index: false, follow: false },
};

export default async function FriendsPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/friends');

  const { friends, mutualIds } = await new SupabaseSocialGraphRepository(supabase).getFriendEdges(
    user.id,
  );

  // Hide the viewer + everyone they already follow from the picker.
  const excludeIds = [user.id, ...friends.map((f) => f.id)];

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <header>
        <h1 className="text-2xl font-bold">Following</h1>
        <p className="text-muted text-sm">
          Players you follow show up in your activity feed and friend filters.
        </p>
      </header>

      <AddFriendForm returnPath="/friends" excludeIds={excludeIds} />

      <section className="space-y-2">
        <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">
          Following ({friends.length})
        </h2>
        <FriendsList friends={friends} mutualIds={mutualIds} returnPath="/friends" />
      </section>
    </div>
  );
}
