import Image from 'next/image';
import Link from 'next/link';
import type { ProfileCard } from '@pickupvb/domain';
import { SupabaseProfileRepository } from '@pickupvb/infrastructure';
import { createSupabaseAnonClient } from '@pickupvb/supabase/anon';
import { Pagination } from '@/components/pagination';
import { POSITION_LABEL } from '@/lib/enum-labels';
import { fieldInputClass } from '@/components/field-styles';
import { primaryButtonClass } from '@/components/primary-button';
import { PlayersFollowProvider, FollowButton } from './_components/players-follow';

// Public listing; no viewer-specific state. Rendered with the sessionless
// anon client so the route stays ISR-cacheable. Mutations elsewhere should
// `revalidatePath('/players')` if they change the listing (today profile
// edits don't, so a 60s baseline TTL is plenty).
export const revalidate = 60;

export const metadata = {
  title: 'Players',
  description:
    'Discover volleyball players on PickupVB. Find people in your area, see who is signed up for events, and connect with teammates.',
  alternates: { canonical: '/players' },
  openGraph: {
    title: 'Volleyball players · PickupVB',
    description:
      'Discover volleyball players on PickupVB. Find people in your area and connect with teammates.',
    url: '/players',
    type: 'website',
    siteName: 'PickupVB',
  },
};

const PAGE_SIZE = 24;

function nameOf(p: ProfileCard): string {
  return p.displayName || 'Player';
}

function initialsOf(p: ProfileCard): string {
  const parts = (p.displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (p.displayName ?? '?').slice(0, 2).toUpperCase();
}

export default async function PlayersIndexPage(props: {
  searchParams: Promise<{ q?: string; city?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const q = (searchParams.q ?? '').trim();
  const city = (searchParams.city ?? '').trim();
  const pageNum = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);

  const profiles = new SupabaseProfileRepository(createSupabaseAnonClient());
  const { cards: players, total } = await profiles.searchDirectory({
    ...(q ? { nameLike: q } : {}),
    ...(city ? { cityLike: city } : {}),
    limit: PAGE_SIZE,
    offset: (pageNum - 1) * PAGE_SIZE,
  });
  const hasFilter = q.length > 0 || city.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4">
      <header>
        <h1 className="text-2xl font-bold">
          Players <span className="text-muted text-base font-normal">· {total}</span>
        </h1>
        <p className="text-muted text-sm">
          Find people to follow, add to your team, or invite to a group.
        </p>
      </header>
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
        <input
          type="search"
          name="q"
          placeholder="Search by name…"
          defaultValue={q}
          className={fieldInputClass}
        />
        <input
          type="search"
          name="city"
          placeholder="Home city"
          defaultValue={city}
          className={fieldInputClass}
        />
        <button type="submit" className={primaryButtonClass()}>
          Search
        </button>
      </form>
      {players.length === 0 ? (
        <p className="border-border-base text-muted rounded-shape-sm border border-dashed p-6 text-center text-sm">
          {hasFilter
            ? 'No players match those filters.'
            : 'No players yet — be the first to sign up.'}
        </p>
      ) : (
        <PlayersFollowProvider playerIds={players.map((p) => p.id)}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {players.map((p) => (
              <li
                key={p.id}
                className="border-border-base bg-surface hover:border-primary/40 focus-within:ring-primary/40 rounded-shape-sm relative flex items-center gap-3 border p-3 focus-within:ring-2"
              >
                {p.avatarUrl ? (
                  <Image
                    src={p.avatarUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="bg-primary/15 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  >
                    {initialsOf(p)}
                  </span>
                )}
                {/* Stretched link: the name covers the whole tile so the avatar,
                    city, and position chips are all clickable; the Follow button
                    (z-10) sits above the overlay and captures its own click. */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/players/${p.handle}`}
                    className="hover:text-primary block truncate text-sm font-semibold after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    {nameOf(p)}
                  </Link>
                  {p.homeCity && <p className="text-muted truncate text-xs">{p.homeCity}</p>}
                  {p.positions.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.positions.map((pos) => (
                        <span
                          key={pos}
                          className="bg-fg/5 text-fg/80 rounded px-1.5 py-0.5 text-[11px]"
                        >
                          {POSITION_LABEL[pos] ?? pos}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <FollowButton playerId={p.id} />
              </li>
            ))}
          </ul>
        </PlayersFollowProvider>
      )}
      <Pagination
        basePath="/players"
        page={pageNum}
        pageSize={PAGE_SIZE}
        total={total}
        searchParams={searchParams}
      />
    </div>
  );
}
