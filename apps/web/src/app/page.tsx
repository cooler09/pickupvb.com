import Link from 'next/link';
import Image from 'next/image';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { SearchEventsQuery } from '@pickupvb/application';
import { SupabaseGroupQueryRepository } from '@pickupvb/infrastructure';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/server-auth';
import { EventCard } from './events/_components/event-card';
import { Icon } from '@/components/icon';

export default async function HomePage(props: {
  searchParams?: Promise<{ code?: string; type?: string }>;
}) {
  const searchParams = await props.searchParams;
  // Supabase sometimes lands recovery/OAuth codes here when its allow-list falls back to Site URL.
  // Forward to the appropriate callback so the user doesn't get stranded.
  if (searchParams?.code) {
    const target = searchParams.type === 'recovery' ? '/auth/reset-password' : '/auth/callback';
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
    new SupabaseGroupQueryRepository(supabase).listCards(6).catch(() => []),
  ]);

  return (
    <div className="space-y-16">
      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="grid gap-10 md:grid-cols-2 md:items-center">
        <div className="space-y-6">
          <h1 className="text-4xl leading-tight font-bold md:text-5xl">
            Find your next <span className="text-primary">volleyball</span> game.
          </h1>
          <p className="text-fg/80 text-lg">
            Pickup, leagues, and tournaments — indoor, grass, and beach. Host an event in minutes
            and let players sign up automatically.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/events"
              className="bg-primary hover:bg-primary/90 rounded-md px-5 py-2.5 font-medium text-white"
            >
              Find events near me
            </Link>
            <Link
              href={user ? '/events/new' : '/login?next=/events/new'}
              className="border-border-base hover:bg-fg/5 rounded-md border px-5 py-2.5 font-medium"
            >
              Host an event
            </Link>
          </div>
          {!user && (
            <p className="text-muted text-sm">
              <Link href={'/login' as Route} className="text-primary hover:underline">
                Sign in
              </Link>{' '}
              to follow players, save events, and host.
            </p>
          )}
        </div>
        <div className="from-primary/15 to-highlight/30 rounded-shape-lg bg-gradient-to-br p-8">
          <ul className="text-fg space-y-3">
            <li className="flex items-center gap-3">
              <Icon name="volleyball" className="text-primary shrink-0" />
              6s, quads, triples, doubles
            </li>
            <li className="flex items-center gap-3">
              <Icon name="beach" className="text-primary shrink-0" />
              Sand, grass, and indoor
            </li>
            <li className="flex items-center gap-3">
              <Icon name="users" className="text-primary shrink-0" />
              Men&apos;s, women&apos;s, coed
            </li>
            <li className="flex items-center gap-3">
              <Icon name="lightning" className="text-primary shrink-0" />
              Real-time spot updates
            </li>
            <li className="flex items-center gap-3">
              <Icon name="trophy" className="text-primary shrink-0" />
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
              <p className="text-muted text-sm">A peek at what&apos;s on the schedule.</p>
            </div>
            <Link href="/events" className="text-primary text-sm font-medium hover:underline">
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
              <h2 className="text-2xl font-bold">Groups &amp; organizations</h2>
              <p className="text-muted text-sm">Clubs, leagues, and crews running events.</p>
            </div>
            <Link
              href={'/groups' as Route}
              className="text-primary text-sm font-medium hover:underline"
            >
              See all →
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groupRows.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.slug}` as Route}
                  className="border-border-base bg-surface hover:border-primary/40 rounded-shape-sm flex items-start gap-3 border p-3"
                >
                  {g.avatarUrl ? (
                    <Image
                      src={g.avatarUrl}
                      alt=""
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="bg-primary/10 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-lg font-semibold">
                      {g.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{g.name}</p>
                    {(g.homeCity || g.region) && (
                      <p className="text-muted truncate text-xs">
                        {[g.homeCity, g.region].filter(Boolean).join(', ')}
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
      <section className="border-border-base bg-surface rounded-shape-lg border p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-[2fr,1fr] md:items-center">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">Running a league or club?</h2>
            <p className="text-fg/80">
              PickupVB gives you everything to run open play, leagues, and tournaments — signups,
              waitlists, online payments with payout to your bank, broadcasts, and printable
              receipts for your players.
            </p>
            <ul className="text-fg/80 grid gap-1.5 text-sm sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <Icon name="check" size={16} className="text-primary shrink-0" />
                Stripe payouts &amp; refunds
              </li>
              <li className="flex items-center gap-2">
                <Icon name="check" size={16} className="text-primary shrink-0" />
                Co-hosts &amp; group permissions
              </li>
              <li className="flex items-center gap-2">
                <Icon name="check" size={16} className="text-primary shrink-0" />
                Waitlists &amp; capacity rules
              </li>
              <li className="flex items-center gap-2">
                <Icon name="check" size={16} className="text-primary shrink-0" />
                Broadcast announcements
              </li>
              <li className="flex items-center gap-2">
                <Icon name="check" size={16} className="text-primary shrink-0" />
                Tax forms &amp; annual statements
              </li>
              <li className="flex items-center gap-2">
                <Icon name="check" size={16} className="text-primary shrink-0" />
                Pro: templates, analytics, sponsor slots &amp; lower fees
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              href={(user ? '/events/new' : '/login?next=/events/new') as Route}
              className="bg-primary hover:bg-primary/90 rounded-md px-4 py-2.5 text-center font-medium text-white"
            >
              Host your first event
            </Link>
            <Link
              href={'/profile/billing/pro' as Route}
              className="border-border-base hover:bg-fg/5 rounded-md border px-4 py-2.5 text-center text-sm font-medium"
            >
              See Pro pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer CTA for guests ───────────────────────────────── */}
      {!user && (
        <section className="from-primary/10 to-highlight/20 rounded-shape-lg bg-gradient-to-br p-6 text-center md:p-8">
          <h2 className="text-2xl font-bold">Ready to play?</h2>
          <p className="text-fg/80 mx-auto mt-2 max-w-xl">
            Create a free account to RSVP, follow players, save events, and host your own.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              href={'/signup' as Route}
              className="bg-primary hover:bg-primary/90 rounded-md px-5 py-2.5 font-medium text-white"
            >
              Create account
            </Link>
            <Link
              href={'/login' as Route}
              className="border-border-base hover:bg-fg/5 rounded-md border px-5 py-2.5 font-medium"
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
      className="group border-border-base bg-surface hover:border-primary/40 rounded-shape-sm flex flex-col gap-2 border p-4"
    >
      <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-md">
        <Icon name={icon} size={22} />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-fg/80 text-sm">{body}</p>
      <p className="text-primary mt-auto pt-1 text-sm font-medium group-hover:underline">{cta} →</p>
    </Link>
  );
}
