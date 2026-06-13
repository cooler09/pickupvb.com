import Link from 'next/link';
import type { Metadata } from 'next/types';
import { NearMeButton } from './near-me-button';
import { LocationSearch } from './location-search';
import { Fab } from '@/components/fab';
import { EventCard } from './_components/event-card';
import { CommunityRail } from './_components/community-rail';
import { EventsEmptyState } from './_components/events-empty-state';
import { EventFiltersDisclosure } from './_components/event-filters-disclosure';
import { EventTimeframeTabs } from './_components/event-timeframe-tabs';
import { ActiveFilterChips } from './_components/active-filter-chips';
import { primaryButtonClass } from '@/components/primary-button';
import { Pagination } from '@/components/pagination';
import PinMapLazy from '@/components/pin-map-lazy';
import { loadEventsPage, PAGE_SIZE } from './_loaders/load-events-page';

export const metadata: Metadata = {
  title: 'Volleyball events',
  description:
    'Browse upcoming pickup volleyball events near you — indoor, grass, and beach. Filter by type (open play, tournament, league), surface, and skill level. Sign up in seconds.',
  alternates: { canonical: '/events' },
  openGraph: {
    title: 'Volleyball events · PickupVB',
    description:
      'Find pickup volleyball events near you. Indoor, grass, and beach. Open play, tournaments, and leagues.',
    url: '/events',
    type: 'website',
  },
};

export default async function EventsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const {
    signedIn,
    when,
    surface,
    type,
    skillBand,
    ageGroup,
    teamComposition,
    seriesName,
    price,
    sort,
    location,
    friendCount,
    friendNameById,
    pageEvents,
    mapPins,
    mappableCount,
    view,
    total,
    page,
    flatParams,
    followingEmptyReason,
    communityListings,
    hasAnyFilter,
    activeFilterCount,
    subheader,
    tabHref,
    buildRemoveHref,
    clearAllHref,
    viewHref,
  } = await loadEventsPage(searchParams);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-headline-lg font-bold">Find events</h1>
          {signedIn && (
            <Link href="/events/new" className={primaryButtonClass('sm')}>
              Host an event
            </Link>
          )}
        </div>
        <p className="text-muted text-sm">{subheader}</p>
      </header>

      {!signedIn && (
        <p className="bg-highlight/30 rounded-md p-4 text-sm">
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>{' '}
          to join and host events.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <EventTimeframeTabs
          when={when}
          showFollowing={signedIn}
          followingCount={friendCount}
          hrefFor={tabHref}
        />
        {/* Location controls only apply to the search tabs — the Following
            feed isn't location-scoped, so hide them there. */}
        {when !== 'following' && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <LocationSearch />
            <NearMeButton />
            <div className="border-border-base rounded-shape-sm flex border p-0.5">
              <Link
                href={viewHref('cards')}
                aria-current={view === 'cards' ? 'page' : undefined}
                className={`rounded-[0.3rem] px-3 py-1 text-sm font-medium ${
                  view === 'cards' ? 'bg-fg/10 text-fg' : 'text-muted hover:text-fg hover:bg-fg/5'
                }`}
              >
                Cards
              </Link>
              <Link
                href={viewHref('map')}
                aria-current={view === 'map' ? 'page' : undefined}
                className={`rounded-[0.3rem] px-3 py-1 text-sm font-medium ${
                  view === 'map' ? 'bg-fg/10 text-fg' : 'text-muted hover:text-fg hover:bg-fg/5'
                }`}
              >
                Map
              </Link>
            </div>
          </div>
        )}
      </div>

      <EventFiltersDisclosure
        activeFilterCount={activeFilterCount}
        when={when}
        surface={surface}
        type={type}
        skillBand={skillBand}
        ageGroup={ageGroup}
        teamComposition={teamComposition}
        seriesName={seriesName}
        price={price}
        sort={sort}
        location={location}
      />

      <ActiveFilterChips
        when={when}
        surface={surface}
        type={type}
        skillBand={skillBand}
        ageGroup={ageGroup}
        teamComposition={teamComposition}
        seriesName={seriesName}
        price={price}
        location={location}
        buildRemoveHref={buildRemoveHref}
        clearAllHref={clearAllHref}
      />

      {total === 0 ? (
        <EventsEmptyState
          when={when}
          reason={followingEmptyReason}
          hasAnyFilter={hasAnyFilter}
          clearAllHref={clearAllHref}
          canHost={signedIn}
        />
      ) : view === 'map' ? (
        mapPins.length === 0 ? (
          <p className="bg-highlight/30 text-muted rounded-md p-6 text-center">
            None of the {total} matching {total === 1 ? 'event has' : 'events have'} a mapped
            location yet.{' '}
            <Link href={viewHref('cards')} className="text-primary font-semibold hover:underline">
              View as cards
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-2">
            <PinMapLazy pins={mapPins} />
            {mappableCount < total && (
              <p className="text-muted text-xs">
                Showing {mappableCount} of {total} events that have a mapped location — the rest are
                visible in{' '}
                <Link href={viewHref('cards')} className="text-primary hover:underline">
                  card view
                </Link>
                .
              </p>
            )}
          </div>
        )
      ) : (
        <>
          <ul className="stagger-in grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pageEvents.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                {...(when === 'following' ? { friendNameById } : {})}
              />
            ))}
          </ul>
          <Pagination
            basePath="/events"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            searchParams={flatParams}
          />
        </>
      )}

      <CommunityRail listings={communityListings} />
      {signedIn && (
        <Fab href="/events/new" label="Host an event">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </Fab>
      )}
    </section>
  );
}
