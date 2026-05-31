import { redirect } from 'next/navigation';
import { SupabaseSocialGraphRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';
import { FriendsList } from '@/components/friends-list';
import { Pagination } from '@/components/pagination';
import { AddFriendForm } from './_components/add-friend-form';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Following — PickupVB',
  robots: { index: false, follow: false },
};

const FRIENDS_PER_PAGE = 24;

export default async function FriendsPage(props: { searchParams: Promise<{ page?: string }> }) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/friends');

  const { friends, mutualIds } = await new SupabaseSocialGraphRepository(supabase).getFriendEdges(
    user.id,
  );

  // Hide the viewer + everyone they already follow from the picker — this needs
  // the full follow set, not just the page rendered below.
  const excludeIds = [user.id, ...friends.map((f) => f.id)];

  // Only the rendered list is paged; the count + exclude set span everyone.
  const pageFriends = friends.slice((page - 1) * FRIENDS_PER_PAGE, page * FRIENDS_PER_PAGE);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <header>
        <h1 className="text-2xl font-bold">Following</h1>
        <p className="text-muted text-sm">
          Players you follow show up in your activity feed and friend filters.
        </p>
      </header>

      <AddFriendForm returnPath="/friends" excludeIds={excludeIds} />

      <section id="following" className="space-y-2">
        <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">
          Following ({friends.length})
        </h2>
        <FriendsList friends={pageFriends} mutualIds={mutualIds} returnPath="/friends" />
        <Pagination
          basePath="/friends"
          page={page}
          pageSize={FRIENDS_PER_PAGE}
          total={friends.length}
          searchParams={searchParams}
          scrollToId="following"
        />
      </section>
    </div>
  );
}
