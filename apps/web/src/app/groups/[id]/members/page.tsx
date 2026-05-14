import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import {
    addGroupMember,
    changeGroupMemberRole,
    removeGroupMember,
} from '@/app/groups/actions';

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

function memberName(p: MemberRow['profiles']): string {
    if (!p) return 'Member';
    const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    return full || p.display_name || 'Member';
}

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
    const members = (memberRows as MemberRow[] | null) ?? [];

    const returnPath = `/groups/${group.id}/members`;

    return (
        <div className="mx-auto max-w-2xl space-y-6 py-4">
            <header className="space-y-1">
                <Link href={`/groups/${group.id}`} className="text-sm text-primary hover:underline">
                    ← Back to {group.name}
                </Link>
                <h1 className="text-2xl font-bold">Manage members</h1>
            </header>

            <section className="rounded-lg border border-border-base p-4">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                    Add a member
                </h2>
                <form action={addMemberFromForm.bind(null, group.id, returnPath)} className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <input
                            name="user_id"
                            placeholder="User ID (UUID)"
                            required
                            className="sm:col-span-2 rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
                        />
                        <select
                            name="role"
                            defaultValue="member"
                            className="rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
                        >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            {myRole === 'owner' && <option value="owner">Owner</option>}
                        </select>
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                        >
                            Add member
                        </button>
                    </div>
                    <p className="text-xs text-muted">
                        Tip: get a user&apos;s UUID from their profile URL — <code className="rounded bg-fg/5 px-1">/players/[id]</code>.
                    </p>
                </form>
            </section>

            <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                    Current members
                </h2>
                <ul className="space-y-2">
                    {members.map((m) => (
                        <li
                            key={m.user_id}
                            className="flex items-center gap-3 rounded-lg border border-border-base bg-surface p-3"
                        >
                            <Link href={`/players/${m.user_id}`} className="flex-1 text-sm font-medium hover:text-primary">
                                {memberName(m.profiles)}
                            </Link>
                            {m.user_id === user.id ? (
                                <span className="text-xs uppercase tracking-wide text-muted">{m.role} (you)</span>
                            ) : (
                                <>
                                    <span className="text-xs uppercase tracking-wide text-muted">{m.role}</span>
                                    {m.role !== 'member' && (
                                        <form action={changeGroupMemberRole.bind(null, group.id, m.user_id, 'member', returnPath)}>
                                            <button type="submit" className="rounded-md border border-border-base px-2 py-1 text-xs hover:bg-fg/5">
                                                → Member
                                            </button>
                                        </form>
                                    )}
                                    {m.role !== 'admin' && (
                                        <form action={changeGroupMemberRole.bind(null, group.id, m.user_id, 'admin', returnPath)}>
                                            <button type="submit" className="rounded-md border border-border-base px-2 py-1 text-xs hover:bg-fg/5">
                                                → Admin
                                            </button>
                                        </form>
                                    )}
                                    {myRole === 'owner' && m.role !== 'owner' && (
                                        <form action={changeGroupMemberRole.bind(null, group.id, m.user_id, 'owner', returnPath)}>
                                            <button type="submit" className="rounded-md border border-border-base px-2 py-1 text-xs hover:bg-fg/5">
                                                → Owner
                                            </button>
                                        </form>
                                    )}
                                    <form action={removeGroupMember.bind(null, group.id, m.user_id, returnPath)}>
                                        <button
                                            type="submit"
                                            className="rounded-md border border-border-base px-2 py-1 text-xs hover:bg-red-50 hover:text-red-700"
                                        >
                                            Remove
                                        </button>
                                    </form>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}

// --- thin wrappers for plain-form (FormData) submissions ---

async function addMemberFromForm(groupId: string, returnPath: string, formData: FormData) {
    'use server';
    const userId = String(formData.get('user_id') ?? '').trim();
    const role = String(formData.get('role') ?? 'member') as 'owner' | 'admin' | 'member';
    if (!userId) return;
    await addGroupMember(groupId, userId, role, returnPath);
}
