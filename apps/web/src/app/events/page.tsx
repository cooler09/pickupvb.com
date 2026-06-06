import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next/types';
import {
  GetFollowingFeedQuery,
  GetViewerFriendsQuery,
  SearchCommunityListingsQuery,
  SearchEventsQuery,
} from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getCurrentUser } from '@/lib/server-auth';
import { relativeEventDay } from '@/lib/date-formats';
import { NearMeButton } from './near-me-button';
import { LocationSearch } from './location-search';
import { Fab } from '@/components/fab';
import {
  EventCard,
  eventPriceCents,
  isEventFree,
  type EventCardData,
} from './_components/event-card';
import { CommunityRail } from './_components/community-rail';
import { EventsEmptyState, type FollowingEmptyReason } from './_components/events-empty-state';
import { EventFilterForm } from './_components/event-filter-form';
import {
  SURFACES,
  TYPES,
  SKILLS,
  AGE_GROUPS,
  TEAM_COMPOSITIONS,
  PRICES,
  SORTS,
  type Skill,
  type Surface,
  type Type,
  type AgeGroupFilter,
  type TeamCompositionFilter,
  type PriceFilter,
  type SortOption,
} from './_components/event-filter-options';
import { EventTimeframeTabs, type Timeframe } from './_components/event-timeframe-tabs';
import { ActiveFilterChips, type FilterKey } from './_components/active-filter-chips';
import { primaryButtonClass, secondaryButtonClass } from '@/components/primary-button';
import { Pagination } from '@/components/pagination';

/** Cards per page in the events grid (fills the 3-column grid evenly). */
const PAGE_SIZE = 12;

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

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function parseFloatOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function pickWhen(value: string | undefined): Timeframe | undefined {
  return value === 'past' || value === 'following' || value === 'upcoming' ? value : undefined;
}

/** Cheapest division price (free = 0) for the "Price: low to high" sort. */
function minPriceCents(event: EventCardData): number {
  const cents = eventPriceCents(event);
  if (cents.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...cents.map((c) => c ?? 0));
}

export default async function EventsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const { user } = await getCurrentUser();

  const get = (k: string): string | undefined => {
    const v = searchParams[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const lat = parseFloatOrNull(get('lat'));
  const lng = parseFloatOrNull(get('lng'));
  const radiusKm = parseFloatOrNull(get('radiusKm')) ?? 40;
  const surface: Surface | undefined = pick(get('surface'), SURFACES);
  const type: Type | undefined = pick(get('type'), TYPES);
  const skillBand: Skill | undefined = pick(get('skillBand'), SKILLS) ?? pick(get('skill'), SKILLS);
  const ageGroup: AgeGroupFilter | undefined = pick(get('ageGroup'), AGE_GROUPS);
  const teamComposition: TeamCompositionFilter | undefined = pick(
    get('teamComposition'),
    TEAM_COMPOSITIONS,
  );
  const seriesNameRaw = get('seriesName')?.trim();
  const seriesName = seriesNameRaw && seriesNameRaw.length > 0 ? seriesNameRaw : undefined;
  // Price filter (Free / Paid). Applied in-memory below; only meaningful on
  // Upcoming/Past, where the search projects per-division prices.
  const price: PriceFilter | undefined = pick(get('price'), PRICES);
  // Sort order. Absence = the per-tab date order. Distance/price are applied
  // in-memory below (non-Following only).
  const sort: SortOption | undefined = pick(get('sort'), SORTS);

  // Pre-fetch the viewer's friends once. Used for both the Following-tab
  // count badge (always) and the per-card "why" labels (Following tab only).
  const friends = user
    ? await handlers.getViewerFriends.execute(new GetViewerFriendsQuery(user.id))
    : [];
  const friendIds = friends.map((f) => f.id);
  const friendNameById = new Map(friends.map((f) => [f.id, f.displayName]));

  // If the viewer follows enough people, default to the Following tab.
  const FOLLOWING_DEFAULT_THRESHOLD = 3;
  const explicitWhen = pickWhen(get('when'));
  const when: Timeframe =
    explicitWhen ??
    (user && friendIds.length >= FOLLOWING_DEFAULT_THRESHOLD ? 'following' : 'upcoming');

  const now = new Date();

  let events: EventCardData[] = [];
  let followingEmptyReason: FollowingEmptyReason = null;

  if (when === 'following') {
    if (!user) {
      followingEmptyReason = 'not_signed_in';
    } else if (friendIds.length === 0) {
      followingEmptyReason = 'no_follows';
    } else {
      const items = await handlers.getFollowingFeed.execute(
        new GetFollowingFeedQuery(user.id, friendIds, {
          startsAfter: now,
          limit: 60,
          ...(surface ? { surface } : {}),
          ...(type ? { type } : {}),
          ...(skillBand ? { skillLevel: skillBand } : {}),
        }),
      );
      events = items.map((it) => ({
        id: it.id,
        title: it.title,
        surface: it.surface,
        skillLevel: it.skillLevel,
        type: it.type,
        startsAt: it.startsAt,
        timeZone: it.timeZone,
        city: it.city,
        region: it.region,
        heroImageUrl: it.heroImageUrl,
        priceCents: it.priceCents,
        priceUnit: it.priceUnit,
        relativeDay: relativeEventDay(it.startsAt, it.timeZone, now),
        spotsRemaining: it.spotsRemaining,
        distanceKm: null,
        ...(it.hostFriendId ? { hostFriendId: it.hostFriendId } : {}),
        ...(it.attendingFriendIds.length > 0
          ? { attendingFriendIds: [...it.attendingFriendIds] }
          : {}),
      }));
    }
  } else {
    const filters: Parameters<typeof handlers.searchEvents.execute>[0]['filters'] = {
      // Fetch a generous ceiling and paginate in-memory (the search RPC
      // returns a flat list with no total count). Beats the old hard cap of
      // 30 that silently hid every event past the first page.
      limit: 120,
      ...(when === 'upcoming' ? { startsAfter: now } : { startsBefore: now }),
      ...(lat !== null && lng !== null
        ? { near: { latitude: lat, longitude: lng, radiusKm } }
        : {}),
      ...(surface ? { surface } : {}),
      ...(type ? { type } : {}),
      ...(skillBand ? { skillBand } : {}),
      ...(ageGroup ? { ageGroup } : {}),
      ...(teamComposition ? { teamComposition } : {}),
      ...(seriesName ? { seriesName } : {}),
    };

    const rawEvents = await handlers.searchEvents.execute(
      new SearchEventsQuery(user?.id ?? null, filters),
    );
    // RPC returns ascending. For past events, show newest first.
    const sorted =
      when === 'past'
        ? [...rawEvents].sort(
            (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
          )
        : rawEvents;
    events = sorted.map((e) => ({
      id: e.id,
      title: e.title,
      surface: e.surface,
      skillLevel: e.skillLevel,
      type: e.type,
      startsAt: e.startsAt,
      timeZone: e.timeZone,
      city: e.city,
      region: e.region,
      heroImageUrl: e.heroImageUrl,
      relativeDay: relativeEventDay(e.startsAt, e.timeZone, now),
      spotsRemaining: e.spotsRemaining,
      distanceKm: e.distanceKm,
      seriesName: e.seriesName,
      seriesPosition: e.seriesPosition,
      seriesSize: e.seriesSize,
      isFundraiser: e.isFundraiser,
      divisions: e.divisions,
    }));
  }

  // Free / Paid filter, in-memory over the fetched set (price isn't a search
  // arg). Works on every tab — `eventPriceCents` reads prices off `divisions`
  // (search) or the explicit list (Following). "free" matches the green chip
  // (every division free); "paid" is the complement.
  if (price) {
    events = events.filter((ev) => {
      const free = isEventFree(eventPriceCents(ev));
      return price === 'free' ? free : !free;
    });
  }

  // Sort override (in-memory, non-Following). Absence keeps the per-tab date
  // order built above. Nulls sort last so events missing the key don't jump
  // to the front.
  if (when !== 'following' && sort) {
    events = [...events].sort((a, b) => {
      if (sort === 'distance') {
        return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
      }
      return minPriceCents(a) - minPriceCents(b);
    });
  }

  const communityListings =
    when === 'upcoming'
      ? await handlers.searchCommunityListings.execute(
          new SearchCommunityListingsQuery(user?.id ?? null, {
            limit: 6,
            startsAfter: now,
            ...(lat !== null && lng !== null
              ? { near: { latitude: lat, longitude: lng, radiusKm } }
              : {}),
            ...(surface ? { surface } : {}),
            ...(skillBand ? { skillLevel: skillBand } : {}),
          }),
        )
      : [];

  const hasLocation = lat !== null && lng !== null;
  const hasAnyFilter = Boolean(
    surface ||
    type ||
    skillBand ||
    ageGroup ||
    teamComposition ||
    seriesName ||
    price ||
    hasLocation,
  );
  // Count for the collapsed "Filters (N)" trigger — mirrors the chips exactly
  // (sort is ordering, not a filter, so it's excluded).
  const activeFilterCount =
    (surface ? 1 : 0) +
    (type ? 1 : 0) +
    (skillBand ? 1 : 0) +
    (ageGroup ? 1 : 0) +
    (teamComposition ? 1 : 0) +
    (seriesName ? 1 : 0) +
    (price ? 1 : 0) +
    (hasLocation ? 1 : 0);

  // Build URLs for tabs / chip removal / clear-all. All preserve the current
  // tab unless the caller explicitly overrides it.
  function buildHref(overrides: Partial<Record<string, string | null>>): Route {
    const params = new URLSearchParams();
    const target = (overrides.when as Timeframe | undefined) ?? when;
    if (target !== 'upcoming') params.set('when', target);
    const set = (key: string, value: string | null | undefined) => {
      if (overrides[key] === null) return;
      const v = overrides[key] !== undefined ? overrides[key]! : value;
      if (v) params.set(key, v);
    };
    set('surface', surface);
    set('type', type);
    set('skillBand', skillBand);
    set('ageGroup', ageGroup);
    set('teamComposition', teamComposition);
    set('seriesName', seriesName);
    set('price', price);
    if (target !== 'following') {
      // Sort + location don't apply to the Following feed — drop them when
      // switching to that tab so a stale param doesn't linger in the URL.
      set('sort', sort);
      if (overrides.location !== null && hasLocation) {
        params.set('lat', String(lat));
        params.set('lng', String(lng));
        params.set('radiusKm', String(radiusKm));
      }
    }
    const q = params.toString();
    return (q ? `/events?${q}` : '/events') as Route;
  }

  const tabHref = (target: Timeframe): Route => buildHref({ when: target });
  const buildRemoveHref = (key: FilterKey): Route => buildHref({ [key]: null });
  const clearAllHref = (when === 'upcoming' ? '/events' : `/events?when=${when}`) as Route;

  // Paginate the result set in-memory. Filter/tab/chip links don't carry a
  // `page` param, so changing a filter naturally resets to page 1; clamp here
  // so a stale `?page=` from the URL can't land on an empty slice.
  const total = events.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.parseInt(get('page') ?? '1', 10) || 1), totalPages);
  const pageEvents = events.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const flatParams: Record<string, string | undefined> = {};
  for (const k of Object.keys(searchParams)) flatParams[k] = get(k);

  const subheader = (() => {
    const parts: string[] = [];
    if (when === 'upcoming') parts.push('Upcoming events');
    else if (when === 'following') parts.push('From people you follow');
    else parts.push('Past events');
    if (hasLocation) parts.push(`within ${radiusKm} km`);
    const label = parts.join(' ');
    if (total === 0) return label;
    return `${total} ${total === 1 ? 'event' : 'events'} · ${label}`;
  })();

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Find events</h1>
          {user && (
            <Link href="/events/new" className={primaryButtonClass('sm')}>
              Host an event
            </Link>
          )}
        </div>
        <p className="text-muted text-sm">{subheader}</p>
      </header>

      {!user && (
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
          showFollowing={!!user}
          followingCount={friendIds.length}
          hrefFor={tabHref}
        />
        {/* Location controls only apply to the search tabs — the Following
            feed isn't location-scoped, so hide them there. */}
        {when !== 'following' && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <LocationSearch />
            <NearMeButton />
          </div>
        )}
      </div>

      {/* Filters collapse behind a single trigger so the results sit higher on
          the page; the active-filter chips below stay visible as the summary.
          Named group (`group/panel`) so the form's inner "More filters" details
          (unnamed `group`) doesn't react to the outer open state. Native
          <details> keeps the no-JS path working (toggle + Apply submit). */}
      <details className="group/panel">
        <summary
          className={`${secondaryButtonClass('sm')} w-fit cursor-pointer list-none gap-1.5 select-none`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-primary text-primary-fg rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
              {activeFilterCount}
            </span>
          )}
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3 w-3 transition-transform group-open/panel:rotate-180"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </summary>
        <div className="mt-3">
          <EventFilterForm
            when={when}
            surface={surface}
            type={type}
            skillBand={skillBand}
            ageGroup={ageGroup}
            teamComposition={teamComposition}
            seriesName={seriesName}
            price={price}
            sort={sort}
            location={hasLocation ? { lat: lat!, lng: lng!, radiusKm } : null}
          />
        </div>
      </details>

      <ActiveFilterChips
        when={when}
        surface={surface}
        type={type}
        skillBand={skillBand}
        ageGroup={ageGroup}
        teamComposition={teamComposition}
        seriesName={seriesName}
        price={price}
        location={hasLocation ? { lat: lat!, lng: lng!, radiusKm } : null}
        buildRemoveHref={buildRemoveHref}
        clearAllHref={clearAllHref}
      />

      {events.length === 0 ? (
        <EventsEmptyState
          when={when}
          reason={followingEmptyReason}
          hasAnyFilter={hasAnyFilter}
          clearAllHref={clearAllHref}
          canHost={!!user}
        />
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
      {user && (
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
