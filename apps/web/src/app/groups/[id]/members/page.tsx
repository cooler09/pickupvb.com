import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SupabaseProfileRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';
import { AddMemberForm } from './_components/add-member-form';
import { MemberRowItem, type MemberListItem } from './_components/member-row-item';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Group members — PickupVB',
  robots: { index: false, follow: false },
};

type GroupRow = { id: string; slug: string; name: string };
type MemberRow = {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
};

export default async function GroupMembersPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/groups/${params.id}/members`);

  const { data: groupData } = await supabase
    .from('groups')
    .select('id, slug, name')
    .eq('slug', params.id)
    .maybeSingle();
  const group = groupData as GroupRow | null;
  if (!group) notFound();

  const { data: meRow } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .maybeSingle();
  const myRole = (meRow as { role: string } | null)?.role;
  if (myRole !== 'owner' && myRole !== 'admin') {
    redirect(`/groups/${group.slug}`);
  }

  const { data: memberRows } = await supabase
    .from('group_members')
    .select('user_id, role, joined_at')
    .eq('group_id', group.id)
    .order('joined_at', { ascending: true });
  const rows = (memberRows as MemberRow[] | null) ?? [];

  const memberUserIds = rows.map((r) => r.user_id);
  const profileMap = await new SupabaseProfileRepository(supabase).findCardsByIds(memberUserIds);

  const members: MemberListItem[] = rows.map((m) => {
    const p = profileMap.get(m.user_id) ?? null;
    return {
      userId: m.user_id,
      role: m.role,
      profile: p
        ? { displayName: p.displayName, firstName: null, lastName: null, handle: p.handle }
        : null,
    };
  });

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
