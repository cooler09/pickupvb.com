import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/server-auth';
import { POSITION_LABEL } from '@/lib/enum-labels';
import {
    HostedEventsList,
    loadVisibleHostedEvents,
} from '@/components/hosted-events-list';
import { addFriend, removeFriend } from '@/app/friends/actions';
import { ShareLink } from '@/components/share-link';
import { Pagination } from '@/components/pagination';
import { ProBadge } from '@/components/pro-badge';
import { isPro } from '@/lib/pro';

const PAST_EVENTS_PER_PAGE = 10;

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const supabase = await getServerSupabase();
    const { data } = await supabase
        .from('profiles')
        .select('handle, display_name, first_name, last_name, home_city')
        .eq('handle', params.id)
        .maybeSingle();
    const row = data as {
        handle: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        home_city: string | null;
    } | null;
    if (!row) return { title: 'Player' };
    const name =
        [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
        || row.display_name
        || 'Player';
    const description = `${name}${row.home_city ? ` of ${row.home_city}` : ''} — volleyball player on PickupVB.`;
    return {
        title: name,
        description,
        alternates: { canonical: `/players/${row.handle}` },
        openGraph: {
            title: `${name} · PickupVB`,
            description,
            url: `/players/${row.handle}`,
            type: 'profile',
        },
    };
}

type PlayerProfile = {
    id: string;
    handle: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    home_city: string | null;
    show_pro_badge: boolean | null;
    primary_position: string | null;
    secondary_position: string | null;
    tertiary_position: string | null;
};

function initialsOf(p: PlayerProfile): string {
    const f = p.first_name?.trim()?.[0];
    const l = p.last_name?.trim()?.[0];
    if (f && l) return (f + l).toUpperCase();
    const parts = (p.display_name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return (p.display_name ?? '?').slice(0, 2).toUpperCase();
}

function nameOf(p: PlayerProfile): string {
    const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    return full || p.display_name || 'Player';
}

export default async function PlayerProfilePage(props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await props.params;
    const rawSearchParams = await props.searchParams;
    const searchParams: Record<string, string | undefined> = Object.fromEntries(
        Object.entries(rawSearchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
    );
    const ppage = Math.max(1, Number.parseInt(searchParams.ppage ?? '1', 10) || 1);
    const supabase = await getServerSupabase();

    // Profile + viewer are independent.
    const [{ data: profileRow }, { user }] = await Promise.all([
        supabase
            .from('profiles')
            .select('id, handle, display_name, first_name, last_name, avatar_url, home_city, show_pro_badge, primary_position, secondary_position, tertiary_position')
            .eq('handle', params.id)
            .maybeSingle(),
        getCurrentUser(),
    ]);

    const profile = profileRow as PlayerProfile | null;
    if (!profile) notFound();

    const isSelf = user?.id === profile.id;

    // Friendship edge + hosted events (upcoming + past split at SQL) are independent.
    const now = new Date();
    const [edgeResult, upcoming, past, isProHost] = await Promise.all([
        user && !isSelf
            ? supabase
                .from('friendships')
                .select('friend_id')
                .eq('user_id', user.id)
                .eq('friend_id', profile.id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        // RLS handles visibility — viewer only sees events they're allowed to.
        loadVisibleHostedEvents(profile.id, { startsAfter: now }),
        loadVisibleHostedEvents(profile.id, { startsBefore: now }),
        profile.show_pro_badge !== false ? isPro(profile.id) : Promise.resolve(false),
    ]);
    const isFollowing = Boolean(edgeResult.data);

    const returnPath = `/players/${profile.handle}`;
    const name = nameOf(profile);

    const positions = [
        profile.primary_position,
        profile.secondary_position,
        profile.tertiary_position,
    ]
        .filter((p): p is string => !!p)
        .map((p) => POSITION_LABEL[p] ?? p);

    return (
        <div className="mx-auto max-w-2xl space-y-8 py-4">
            {/* ── Identity card ─────────────────────────────────────── */}
            <header className="rounded-lg border border-border-base bg-surface p-5">
                <div className="flex items-start gap-4">
                    {profile.avatar_url ? (
                        <Image
                            src={profile.avatar_url}
                            alt=""
                            width={72}
                            height={72}
                            className="h-20 w-20 shrink-0 rounded-full object-cover"
                        />
                    ) : (
                        <span
                            aria-hidden="true"
                            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xl font-semibold text-primary"
                        >
                            {initialsOf(profile)}
                        </span>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h1 className="truncate text-2xl font-bold text-fg">
                                {name}
                            </h1>
                            {isProHost && <ProBadge />}
                        </div>
                        <p className="text-sm text-muted">
                            {profile.home_city ?? 'No home city set'}
                        </p>
                        {positions.length > 0 && (
                            <p className="mt-1 text-xs text-muted">
                                {positions.join(' · ')}
                            </p>
                        )}
                    </div>
                </div>

                {/* Primary CTA + share row */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!isSelf &&
                        (user ? (
                            isFollowing ? (
                                <form action={removeFriend.bind(null, profile.id, returnPath)}>
                                    <button
                                        type="submit"
                                        className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                                    >
                                        ✓ Following
                                    </button>
                                </form>
                            ) : (
                                <form action={addFriend.bind(null, profile.id, returnPath)}>
                                    <button
                                        type="submit"
                                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
                                    >
                                        + Follow
                                    </button>
                                </form>
                            )
                        ) : (
                            <Link
                                href={`/login?next=${encodeURIComponent(returnPath)}` as Route}
                                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
                            >
                                Sign in to follow
                            </Link>
                        ))}
                    {isSelf && (
                        <Link
                            href={'/profile' as Route}
                            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
                        >
                            Edit profile →
                        </Link>
                    )}
                    <ShareLink path={`/players/${profile.handle}`} title={name} />
                </div>
            </header>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-fg">
                    Upcoming events{' '}
                    <span className="text-sm font-normal text-muted">({upcoming.length})</span>
                </h2>
                <HostedEventsList
                    events={upcoming}
                    emptyState={
                        isSelf
                            ? "You aren't hosting any upcoming events yet."
                            : `${name} isn't hosting any upcoming events you can see.`
                    }
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
                        basePath={`/players/${profile.handle}`}
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
