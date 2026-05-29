import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SupabaseGroupQueryRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';
import { AddMemberForm } from './_components/add-member-form';
import { MemberRowItem, type MemberListItem } from './_components/member-row-item';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Group members — PickupVB',
  robots: { index: false, follow: false },
};

export default async function GroupMembersPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/groups/${params.id}/members`);

  const groupQueries = new SupabaseGroupQueryRepository(supabase);
  const group = await groupQueries.findDetailBySlug(params.id);
  if (!group) notFound();

  const myRole = await groupQueries.findViewerRole(group.id, user.id);
  if (myRole !== 'owner' && myRole !== 'admin') {
    redirect(`/groups/${group.slug}`);
  }

  const memberCards = await groupQueries.listMembers(group.id);
  const members: MemberListItem[] = memberCards.map((m) => ({
    userId: m.userId,
    role: m.role,
    profile: m.profile
      ? {
          displayName: m.profile.displayName,
          firstName: null,
          lastName: null,
          handle: m.profile.handle,
        }
      : null,
  }));

  const returnPath = `/groups/${group.slug}/members`;
  const viewerIsOwner = myRole === 'owner';

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <header className="space-y-1">
        <Link href={`/groups/${group.slug}`} className="text-primary text-sm hover:underline">
          ← Back to {group.name}
        </Link>
        <h1 className="text-2xl font-bold">Manage members</h1>
      </header>

      <AddMemberForm
        groupId={group.id}
        canPromoteToOwner={viewerIsOwner}
        returnPath={returnPath}
        existingMemberIds={members.map((m) => m.userId)}
      />

      <section className="space-y-2">
        <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">
          Current members
        </h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <MemberRowItem
              key={m.userId}
              groupId={group.id}
              member={m}
              isSelf={m.userId === user.id}
              viewerIsOwner={viewerIsOwner}
              returnPath={returnPath}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
