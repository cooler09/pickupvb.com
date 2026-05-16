import { notFound } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/server-auth';
import { HostedEventsList } from '@/components/hosted-events-list';
import { loadVisibleGroupHostedEvents } from '@/components/group-hosted-events';
import { Pagination } from '@/components/pagination';
import { GroupHeader } from './_components/group-header';
import { MembersSection, type GroupMember } from './_components/members-section';

export const dynamic = 'force-dynamic';

const PAST_EVENTS_PER_PAGE = 10;

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

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const supabase = await getServerSupabase();
    const { data } = await supabase
        .from('groups')
        .select('name, description, home_city, region')
        .eq('id', params.id)
        .maybeSingle();
    const row = data as {
        name: string;
        description: string | null;
        home_city: string | null;
        region: string | null;
    } | null;
    if (!row) return { title: 'Group' };
    const place = [row.home_city, row.region].filter(Boolean).join(', ');
    const description = row.description
        ? row.description.slice(0, 200)
        : `${row.name}${place ? ` — ${place}` : ''}. A volleyball group on PickupVB.`;
    return {
        title: row.name,
        description,
        alternates: { canonical: `/groups/${params.id}` },
        openGraph: {
            title: `${row.name} · PickupVB`,
            description,
            url: `/groups/${params.id}`,
            type: 'website',
        },
    };
}

export default async function GroupProfilePage(props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await props.params;
    const rawSearchParams = await props.searchParams;
    const searchParams: Record<string, string | undefined> = Object.fromEntries(
        Object.entries(rawSearchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
    );
    const mpage = Math.max(1, Number.parseInt(searchParams.mpage ?? '1', 10) || 1);
    const ppage = Math.max(1, Number.parseInt(searchParams.ppage ?? '1', 10) || 1);
    const supabase = await getServerSupabase();

    const { data: groupData } = await supabase
        .from('groups')
        .select('id, slug, name, description, avatar_url, home_city, region, created_by')
        .eq('id', params.id)
        .maybeSingle();
    const group = groupData as GroupRow | null;
    if (!group) notFound();

    const { user } = await getCurrentUser();

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

            <MembersSection
                groupId={group.id}
                members={members}
                canManage={canManage}
                page={mpage}
                searchParams={searchParams}
            />

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
                <section id="past-events" className="space-y-3">
                    <h2 className="text-lg font-semibold text-fg">
                        Past events{' '}
                        <span className="text-sm font-normal text-muted">({past.length})</span>
                    </h2>
                    <HostedEventsList
                        events={past.slice(
                            (ppage - 1) * PAST_EVENTS_PER_PAGE,
                            ppage * PAST_EVENTS_PER_PAGE,
                        )}
                        emptyState=""
                    />
                    <Pagination
                        basePath={`/groups/${group.id}`}
                        page={ppage}
                        pageSize={PAST_EVENTS_PER_PAGE}
                        total={past.length}
                        searchParams={searchParams}
                        pageParam="ppage"
                        scrollToId="past-events"
                    />
                </section>
            )}
        </div>
    );
}
