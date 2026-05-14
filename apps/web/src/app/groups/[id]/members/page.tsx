import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { AddMemberForm } from './_components/add-member-form';
import { MemberRowItem, type MemberListItem } from './_components/member-row-item';

export const dynamic = 'force-dynamic';

type GroupRow = { id: string; name: string };
type MemberRow = {
    user_id: string;
    role: 'owner' | 'admin' | 'member';
    joined_at: string;
    profiles: {
        display_name: string;
        first_name: string | null;
        last_name: string | null;
    } | null;
};

export default async function GroupMembersPage({ params }: { params: { id: string } }) {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(`/login?next=/groups/${params.id}/members`);

    const { data: groupData } = await supabase
        .from('groups')
        .select('id, name')
        .eq('id', params.id)
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
        redirect(`/groups/${group.id}`);
    }

    const { data: memberRows } = await supabase
        .from('group_members')
        .select('user_id, role, joined_at, profiles:profiles!inner(display_name, first_name, last_name)')
        .eq('group_id', group.id)
        .order('joined_at', { ascending: true });
    const rows = (memberRows as MemberRow[] | null) ?? [];
    const members: MemberListItem[] = rows.map((m) => ({
        userId: m.user_id,
        role: m.role,
        profile: m.profiles
            ? {
                displayName: m.profiles.display_name,
                firstName: m.profiles.first_name,
                lastName: m.profiles.last_name,
            }
            : null,
    }));

    const returnPath = `/groups/${group.id}/members`;
    const viewerIsOwner = myRole === 'owner';

    return (
        <div className="mx-auto max-w-2xl space-y-6 py-4">
            <header className="space-y-1">
                <Link href={`/groups/${group.id}`} className="text-sm text-primary hover:underline">
                    ← Back to {group.name}
                </Link>
                <h1 className="text-2xl font-bold">Manage members</h1>
            </header>

            <AddMemberForm
                groupId={group.id}
                canPromoteToOwner={viewerIsOwner}
                returnPath={returnPath}
            />

            <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
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
