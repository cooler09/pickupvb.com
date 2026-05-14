import { notFound } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { HostedEventsList } from '@/components/hosted-events-list';
import { loadVisibleGroupHostedEvents } from '@/components/group-hosted-events';
import { GroupHeader } from './_components/group-header';
import { MembersSection, type GroupMember } from './_components/members-section';

export const dynamic = 'force-dynamic';

type GroupRow = {
    id: string;
    slug: string;
    name: string;
    description: string;
    avatar_url: string | null;
    home_city: string | null;
    region: string | null;
    created_by: string;
};

type MemberRow = {
    user_id: string;
    role: 'owner' | 'admin' | 'member';
    profiles: {
        display_name: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
    } | null;
};

export async function generateMetadata({ params }: { params: { id: string } }) {
    const supabase = getServerSupabase();
    const { data } = await supabase.from('groups').select('name').eq('id', params.id).maybeSingle();
    const name = (data as { name: string } | null)?.name;
    return { title: name ? `${name} — PickupVB` : 'Group — PickupVB' };
}

export default async function GroupProfilePage({ params }: { params: { id: string } }) {
    const supabase = getServerSupabase();

    const { data: groupData } = await supabase
        .from('groups')
        .select('id, slug, name, description, avatar_url, home_city, region, created_by')
        .eq('id', params.id)
        .maybeSingle();
    const group = groupData as GroupRow | null;
    if (!group) notFound();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { data: memberRows } = await supabase
        .from('group_members')
        .select('user_id, role, profiles:profiles!inner(display_name, first_name, last_name, avatar_url)')
        .eq('group_id', group.id)
        .order('joined_at', { ascending: true });
    const memberRowsTyped = (memberRows as MemberRow[] | null) ?? [];

    const myMembership = user ? memberRowsTyped.find((m) => m.user_id === user.id) ?? null : null;
    const canManage = myMembership?.role === 'owner' || myMembership?.role === 'admin';

    let isFollowing = false;
    if (user) {
        const { data: followRow } = await supabase
            .from('group_followers')
            .select('group_id')
            .eq('group_id', group.id)
            .eq('user_id', user.id)
            .maybeSingle();
        isFollowing = Boolean(followRow);
    }

    const events = await loadVisibleGroupHostedEvents(group.id);
    const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= Date.now());
    const past = events.filter((e) => new Date(e.starts_at).getTime() < Date.now());

    const returnPath = `/groups/${group.id}`;

    // Map row shape to the component's camelCase prop shape.
    const members: GroupMember[] = memberRowsTyped.map((m) => ({
        userId: m.user_id,
        role: m.role,
        profile: m.profiles
            ? {
                displayName: m.profiles.display_name,
                firstName: m.profiles.first_name,
                lastName: m.profiles.last_name,
                avatarUrl: m.profiles.avatar_url,
            }
            : null,
    }));

    return (
        <div className="mx-auto max-w-3xl space-y-8 py-4">
            <GroupHeader
                group={{
                    id: group.id,
                    slug: group.slug,
                    name: group.name,
                    description: group.description,
                    avatarUrl: group.avatar_url,
                    homeCity: group.home_city,
                    region: group.region,
                }}
                canManage={canManage}
                isSignedIn={!!user}
                isFollowing={isFollowing}
                returnPath={returnPath}
            />

            <MembersSection groupId={group.id} members={members} canManage={canManage} />

            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-fg">
                    Upcoming events{' '}
                    <span className="text-sm font-normal text-muted">({upcoming.length})</span>
                </h2>
                <HostedEventsList
                    events={upcoming}
                    emptyState={`${group.name} isn't hosting any upcoming events you can see.`}
                />
            </section>

            {past.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold text-fg">
                        Past events{' '}
                        <span className="text-sm font-normal text-muted">({past.length})</span>
                    </h2>
                    <HostedEventsList events={past} emptyState="" />
                </section>
            )}
        </div>
    );
}
