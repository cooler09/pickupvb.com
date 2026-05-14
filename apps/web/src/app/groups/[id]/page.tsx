import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { HostedEventsList } from '@/components/hosted-events-list';
import { loadVisibleGroupHostedEvents } from '@/components/group-hosted-events';
import { followGroup, unfollowGroup } from '@/app/groups/actions';

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

function memberName(p: MemberRow['profiles']): string {
    if (!p) return 'Member';
    const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    return full || p.display_name || 'Member';
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

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
    const members = (memberRows as MemberRow[] | null) ?? [];

    const myMembership = user ? members.find((m) => m.user_id === user.id) ?? null : null;
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

    return (
        <div className="mx-auto max-w-3xl space-y-8 py-4">
            <header className="flex items-start gap-4">
                {group.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={group.avatar_url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                ) : (
                    <span
                        aria-hidden="true"
                        className="flex h-20 w-20 items-center justify-center rounded-lg bg-primary/15 text-xl font-semibold text-primary"
                    >
                        {group.name.slice(0, 2).toUpperCase()}
                    </span>
                )}
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold text-fg">{group.name}</h1>
                    <p className="text-xs text-muted">@{group.slug}</p>
                    {(group.home_city || group.region) && (
                        <p className="mt-0.5 text-sm text-muted">
                            {[group.home_city, group.region].filter(Boolean).join(', ')}
                        </p>
                    )}
                    {group.description && <p className="mt-2 text-sm text-fg/90">{group.description}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                    {canManage && (
                        <Link
                            href={`/groups/${group.id}/edit`}
                            className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                        >
                            Edit
                        </Link>
                    )}
                    {user ? (
                        isFollowing ? (
                            <form action={unfollowGroup.bind(null, group.id, returnPath)}>
                                <button
                                    type="submit"
                                    className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                                >
                                    ✓ Following
                                </button>
                            </form>
                        ) : (
                            <form action={followGroup.bind(null, group.id, returnPath)}>
                                <button
                                    type="submit"
                                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                                >
                                    + Follow
                                </button>
                            </form>
                        )
                    ) : (
                        <Link
                            href={`/login?next=${encodeURIComponent(returnPath)}`}
                            className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                        >
                            Sign in to follow
                        </Link>
                    )}
                </div>
            </header>

            <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-lg font-semibold text-fg">
                        Members <span className="text-sm font-normal text-muted">({members.length})</span>
                    </h2>
                    {canManage && (
                        <Link
                            href={`/groups/${group.id}/members`}
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            Manage members
                        </Link>
                    )}
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                    {members.map((m) => {
                        const name = memberName(m.profiles);
                        return (
                            <li key={m.user_id}>
                                <Link
                                    href={`/players/${m.user_id}`}
                                    className="flex items-center gap-3 rounded-lg border border-border-base bg-surface p-2 hover:border-primary/40"
                                >
                                    {m.profiles?.avatar_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={m.profiles.avatar_url}
                                            alt=""
                                            className="h-9 w-9 rounded-full object-cover"
                                        />
                                    ) : (
                                        <span
                                            aria-hidden="true"
                                            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                                        >
                                            {initials(name)}
                                        </span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{name}</p>
                                        <p className="text-[10px] uppercase tracking-wide text-muted">{m.role}</p>
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-fg">
                    Upcoming events <span className="text-sm font-normal text-muted">({upcoming.length})</span>
                </h2>
                <HostedEventsList
                    events={upcoming}
                    emptyState={`${group.name} isn't hosting any upcoming events you can see.`}
                />
            </section>

            {past.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold text-fg">
                        Past events <span className="text-sm font-normal text-muted">({past.length})</span>
                    </h2>
                    <HostedEventsList events={past} emptyState="" />
                </section>
            )}
        </div>
    );
}
