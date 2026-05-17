import Link from 'next/link';
import Image from 'next/image';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { SearchEventsQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/server-auth';
import { EventCard } from './events/_components/event-card';
import { Icon } from '@/components/icon';

export const dynamic = 'force-dynamic';

type GroupRow = {
    id: string;
    slug: string;
    name: string;
    avatar_url: string | null;
    home_city: string | null;
    region: string | null;
};

export default async function HomePage(
    props: {
        searchParams?: Promise<{ code?: string; type?: string }>;
    }
) {
    const searchParams = await props.searchParams;
    // Supabase sometimes lands recovery/OAuth codes here when its allow-list falls back to Site URL.
    // Forward to the appropriate callback so the user doesn't get stranded.
    if (searchParams?.code) {
        const target =
            searchParams.type === 'recovery'
                ? '/auth/reset-password'
                : '/auth/callback';
        redirect(`${target}?code=${encodeURIComponent(searchParams.code)}`);
    }

    const { user } = await getCurrentUser();
    const supabase = await getServerSupabase();
    const now = new Date();

    // Pull a small slice of fresh content to make the landing page feel alive.
    // Both queries degrade gracefully to empty arrays when there's nothing
    // (or when the user has no session and RLS limits visibility).
    const [upcomingEvents, groupRows] = await Promise.all([
        handlers.searchEvents
            .execute(
                new SearchEventsQuery(user?.id ?? null, {
                    startsAfter: now,
                    limit: 6,
                }),
            )
            .catch(() => []),
        supabase
            .from('groups')
            .select('id, slug, name, avatar_url, home_city, region')
            .order('name', { ascending: true })
            .limit(6)
            .then((res) => (res.data as GroupRow[] | null) ?? []),
    ]);

    return (
        <div className="space-y-16">
            {/* ── Hero ────────────────────────────────────────────────── */}
            <section className="grid gap-10 md:grid-cols-2 md:items-center">
                <div className="space-y-6">
                    <h1 className="text-4xl font-bold leading-tight md:text-5xl">
                        Find your next{' '}
                        <span className="text-primary">volleyball</span> game.
                    </h1>
                    <p className="text-lg text-fg/80">
                        Pickup, leagues, and tournaments — indoor, grass, and
                        beach. Host an event in minutes and let players sign
                        up automatically.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Link
                            href="/events"
                            className="rounded-md bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary/90"
                        >
                            Find events near me
                        </Link>
                        <Link
                            href={user ? '/events/new' : '/login?next=/events/new'}
                            className="rounded-md border border-border-base px-5 py-2.5 font-medium hover:bg-fg/5"
                        >
                            Host an event
                        </Link>
                    </div>
                    {!user && (
                        <p className="text-sm text-muted">
                            <Link
                                href={'/login' as Route}
                                className="text-primary hover:underline"
                            >
                                Sign in
                            </Link>{' '}
                            to follow players, save events, and host.
                        </p>
                    )}
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-highlight/30 p-8">
                    <ul className="space-y-3 text-fg">
                        <li className="flex items-center gap-3">
                            <Icon name="volleyball" className="shrink-0 text-primary" />
                            6s, quads, triples, doubles
                        </li>
                        <li className="flex items-center gap-3">
                            <Icon name="beach" className="shrink-0 text-primary" />
                            Sand, grass, and indoor
                        </li>
                        <li className="flex items-center gap-3">
                            <Icon name="users" className="shrink-0 text-primary" />
                            Men&apos;s, women&apos;s, coed
                        </li>
                        <li className="flex items-center gap-3">
                            <Icon name="lightning" className="shrink-0 text-primary" />
                            Real-time spot updates
                        </li>
                        <li className="flex items-center gap-3">
                            <Icon name="trophy" className="shrink-0 text-primary" />
                            Tournament tools for hosts
                        </li>
                    </ul>
                </div>
            </section>

            {/* ── Upcoming events ─────────────────────────────────────── */}
            {upcomingEvents.length > 0 && (
                <section className="space-y-4">
                    <div className="flex items-end justify-between gap-3">
                        <div>
                            <h2 className="text-2xl font-bold">Upcoming events</h2>
                            <p className="text-sm text-muted">
                                A peek at what&apos;s on the schedule.
                            </p>
                        </div>
                        <Link
                            href="/events"
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            Browse all →
                        </Link>
                    </div>
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {upcomingEvents.slice(0, 6).map((e) => (
                            <EventCard
                                key={e.id}
                                event={{
                                    id: e.id,
                                    title: e.title,
                                    surface: e.surface,
                                    skillLevel: e.skillLevel,
                                    type: e.type,
                                    startsAt: e.startsAt,
                                    city: e.city,
                                    region: e.region,
                                    spotsRemaining: null,
                                    distanceKm: null,
                                }}
                            />
                        ))}
                    </ul>
                </section>
            )}

            {/* ── What you can do ─────────────────────────────────────── */}
            <section className="space-y-4">
                <h2 className="text-2xl font-bold">What you can do here</h2>
                <div className="grid gap-3 md:grid-cols-3">
                    <ValueCard
                        icon="volleyball"
                        title="Play"
                        body="Search pickup, open play, leagues, and tournaments. Filter by surface, format, and skill. RSVP in one tap."
                        cta="Find events"
                        href={'/events' as Route}
                    />
                    <ValueCard
                        icon="users"
                        title="Connect"
                        body="Follow players, join groups, and see what your crew is signed up for next."
                        cta="Browse groups"
                        href={'/groups' as Route}
                    />
                    <ValueCard
                        icon="trophy"
                        title="Host"
                        body="Spin up an event in minutes. Collect signups, run waitlists, take payment, and broadcast updates."
                        cta="Host an event"
                        href={(user ? '/events/new' : '/login?next=/events/new') as Route}
                    />
                </div>
            </section>

            {/* ── Groups & organizations ──────────────────────────────── */}
            {groupRows.length > 0 && (
                <section className="space-y-4">
                    <div className="flex items-end justify-between gap-3">
                        <div>
                            <h2 className="text-2xl font-bold">
                                Groups &amp; organizations
                            </h2>
                            <p className="text-sm text-muted">
                                Clubs, leagues, and crews running events.
                            </p>
                        </div>
                        <Link
                            href={'/groups' as Route}
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            See all →
                        </Link>
                    </div>
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {groupRows.map((g) => (
                            <li key={g.id}>
                                <Link
                                    href={`/groups/${g.slug}` as Route}
                                    className="flex items-start gap-3 rounded-lg border border-border-base bg-surface p-3 hover:border-primary/40"
                                >
                                    {g.avatar_url ? (
                                        <Image
                                            src={g.avatar_url}
                                            alt=""
                                            width={48}
                                            height={48}
                                            className="h-12 w-12 shrink-0 rounded-md object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-lg font-semibold text-primary">
                                            {g.name.slice(0, 1).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="truncate font-medium">{g.name}</p>
                                        {(g.home_city || g.region) && (
                                            <p className="truncate text-xs text-muted">
                                                {[g.home_city, g.region]
                                                    .filter(Boolean)
                                                    .join(', ')}
                                            </p>
                                        )}
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* ── Host pitch ──────────────────────────────────────────── */}
            <section className="rounded-2xl border border-border-base bg-surface p-6 md:p-8">
                <div className="grid gap-6 md:grid-cols-[2fr,1fr] md:items-center">
                    <div className="space-y-3">
                        <h2 className="text-2xl font-bold">Running a league or club?</h2>
                        <p className="text-fg/80">
                            PickupVB gives you everything to run open play,
                            leagues, and tournaments — signups, waitlists,
                            online payments with payout to your bank,
                            broadcasts, and printable receipts for your
                            players.
                        </p>
                        <ul className="grid gap-1.5 text-sm text-fg/80 sm:grid-cols-2">
                            <li className="flex items-center gap-2">
                                <Icon name="check" size={16} className="shrink-0 text-primary" />
                                Stripe payouts &amp; refunds
                            </li>
                            <li className="flex items-center gap-2">
                                <Icon name="check" size={16} className="shrink-0 text-primary" />
                                Co-hosts &amp; group permissions
                            </li>
                            <li className="flex items-center gap-2">
                                <Icon name="check" size={16} className="shrink-0 text-primary" />
                                Waitlists &amp; capacity rules
                            </li>
                            <li className="flex items-center gap-2">
                                <Icon name="check" size={16} className="shrink-0 text-primary" />
                                Broadcast announcements
                            </li>
                            <li className="flex items-center gap-2">
                                <Icon name="check" size={16} className="shrink-0 text-primary" />
                                Tax forms &amp; annual statements
                            </li>
                            <li className="flex items-center gap-2">
                                <Icon name="check" size={16} className="shrink-0 text-primary" />
                                Pro tier: 2.5% platform fee
                            </li>
                        </ul>
                    </div>
                    <div className="flex flex-col gap-2">
                        <Link
                            href={(user ? '/events/new' : '/login?next=/events/new') as Route}
                            className="rounded-md bg-primary px-4 py-2.5 text-center font-medium text-white hover:bg-primary/90"
                        >
                            Host your first event
                        </Link>
                        <Link
                            href={'/profile/billing/pro' as Route}
                            className="rounded-md border border-border-base px-4 py-2.5 text-center text-sm font-medium hover:bg-fg/5"
                        >
                            See Pro pricing
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── Footer CTA for guests ───────────────────────────────── */}
            {!user && (
                <section className="rounded-2xl bg-gradient-to-br from-primary/10 to-highlight/20 p-6 text-center md:p-8">
                    <h2 className="text-2xl font-bold">Ready to play?</h2>
                    <p className="mx-auto mt-2 max-w-xl text-fg/80">
                        Create a free account to RSVP, follow players, save
                        events, and host your own.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-3">
                        <Link
                            href={'/signup' as Route}
                            className="rounded-md bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary/90"
                        >
                            Create account
                        </Link>
                        <Link
                            href={'/login' as Route}
                            className="rounded-md border border-border-base px-5 py-2.5 font-medium hover:bg-fg/5"
                        >
                            Sign in
                        </Link>
                    </div>
                </section>
            )}
        </div>
    );
}

function ValueCard({
    icon,
    title,
    body,
    cta,
    href,
}: {
    icon: 'volleyball' | 'users' | 'trophy';
    title: string;
    body: string;
    cta: string;
    href: Route;
}) {
    return (
        <Link
            href={href}
            className="group flex flex-col gap-2 rounded-lg border border-border-base bg-surface p-4 hover:border-primary/40"
        >
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon name={icon} size={22} />
            </div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm text-fg/80">{body}</p>
            <p className="mt-auto pt-1 text-sm font-medium text-primary group-hover:underline">
                {cta} →
            </p>
        </Link>
    );
}
