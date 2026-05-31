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
import { NearMeButton } from './near-me-button';
import { Fab } from '@/components/fab';
import { EventCard, type EventCardData } from './_components/event-card';
import { CommunityListingCard } from '@/app/community/_components/community-listing-card';
import {
  EventFilterForm,
  SURFACES,
  TYPES,
  SKILLS,
  AGE_GROUPS,
  TEAM_COMPOSITIONS,
  type Skill,
  type Surface,
  type Type,
  type AgeGroupFilter,
  type TeamCompositionFilter,
} from './_components/event-filter-form';
import { EventTimeframeTabs, type Timeframe } from './_components/event-timeframe-tabs';
import { ActiveFilterChips, type FilterKey } from './_components/active-filter-chips';
import { primaryButtonClass, secondaryButtonClass } from '@/components/primary-button';

export const metadata: Metadata = {
  title: 'Volleyball events',
  description:
    'Browse upcoming pickup volleyball events near you — indoor, grass, and beach. Filter by surface, format, and skill level. Sign up in seconds.',
  alternates: { canonical: '/events' },
  openGraph: {
    title: 'Volleyball events · PickupVB',
    description:
      'Find pickup volleyball events near you. Indoor, grass, and beach. Open play and tournaments.',
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

type FollowingEmptyReason = 'not_signed_in' | 'no_follows' | null;

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
        spotsRemaining: null,
        distanceKm: null,
        ...(it.hostFriendId ? { hostFriendId: it.hostFriendId } : {}),
        ...(it.attendingFriendIds.length > 0
          ? { attendingFriendIds: [...it.attendingFriendIds] }
          : {}),
      }));
    }
  } else {
    const filters: Parameters<typeof handlers.searchEvents.execute>[0]['filters'] = {
      limit: 30,
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
      spotsRemaining: e.spotsRemaining,
      distanceKm: e.distanceKm,
      seriesName: e.seriesName,
      seriesPosition: e.seriesPosition,
      seriesSize: e.seriesSize,
      isFundraiser: e.isFundraiser,
      divisions: e.divisions,
    }));
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
    surface || type || skillBand || ageGroup || teamComposition || seriesName || hasLocation,
  );

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
    if (target !== 'following') {
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

  const subheader = (() => {
    const parts: string[] = [];
    if (when === 'upcoming') parts.push('Upcoming events');
    else if (when === 'following') parts.push('From people you follow');
    else parts.push('Past events');
    if (hasLocation) parts.push(`within ${radiusKm} km`);
    return parts.join(' ');
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
        <div className="ml-auto">
          <NearMeButton />
        </div>
      </div>

      <EventFilterForm
        when={when}
        surface={surface}
        type={type}
        skillBand={skillBand}
        ageGroup={ageGroup}
        teamComposition={teamComposition}
        seriesName={seriesName}
        location={hasLocation ? { lat: lat!, lng: lng!, radiusKm } : null}
      />

      <ActiveFilterChips
        when={when}
        surface={surface}
        type={type}
        skillBand={skillBand}
        ageGroup={ageGroup}
        teamComposition={teamComposition}
        seriesName={seriesName}
        location={hasLocation ? { lat: lat!, lng: lng!, radiusKm } : null}
        buildRemoveHref={buildRemoveHref}
        clearAllHref={clearAllHref}
      />

      {events.length === 0 ? (
        <EmptyState
          when={when}
          reason={followingEmptyReason}
          hasAnyFilter={hasAnyFilter}
          clearAllHref={clearAllHref}
          canHost={!!user}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} {...(when === 'following' ? { friendNameById } : {})} />
          ))}
        </ul>
      )}

      {communityListings.length > 0 && (
        <section className="border-border-base space-y-3 border-t pt-6">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold">From the community</h2>
              <p className="text-muted text-sm">
                Events posted by players that aren&rsquo;t hosted on PickupVB. RSVP at the linked
                source.
              </p>
            </div>
            <Link
              href="/community"
              className="text-primary text-sm whitespace-nowrap hover:underline"
            >
              See all
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {communityListings.map((listing) => (
              <CommunityListingCard
                key={listing.id}
                listing={{
                  slug: listing.slug,
                  title: listing.title,
                  externalHostName: listing.externalHostName,
                  startsAt: listing.startsAt,
                  timeZone: listing.timeZone,
                  city: listing.city,
                  region: listing.region,
                  surface: listing.surface,
                  format: listing.format,
                  skillLevel: listing.skillLevel,
                  status: listing.status,
                }}
              />
            ))}
          </ul>
        </section>
      )}
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

function EmptyState({
  when,
  reason,
  hasAnyFilter,
  clearAllHref,
  canHost,
}: {
  when: Timeframe;
  reason: FollowingEmptyReason;
  hasAnyFilter: boolean;
  clearAllHref: Route;
  canHost: boolean;
}) {
  let title = 'No events match your filters';
  let body: string | null = null;
  if (when === 'past') {
    title = 'No past events match your filters';
  } else if (when === 'following') {
    if (reason === 'not_signed_in') {
      title = 'Sign in to see events from people you follow';
      body = "We'll personalize your feed once you're signed in.";
    } else if (reason === 'no_follows') {
      title = "You're not following anyone yet";
      body = 'Follow players from any event page to see their upcoming events here.';
    } else {
      title = 'No upcoming events from people you follow';
      body = 'Try the Upcoming tab to see more events near you.';
    }
  } else if (!hasAnyFilter) {
    title = 'No upcoming events yet';
    body = canHost
      ? 'Be the first to host one in your area.'
      : 'Check back soon or sign in to host an event.';
  } else {
    body = 'Try clearing a filter or widening your radius.';
  }

  return (
    <div className="border-border-base bg-surface rounded-shape-sm border p-8 text-center">
      <h3 className="text-fg text-base font-semibold">{title}</h3>
      {body && <p className="text-muted mt-1 text-sm">{body}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {hasAnyFilter && (
          <Link href={clearAllHref} className={secondaryButtonClass('sm')}>
            Clear filters
          </Link>
        )}
        {when === 'following' && reason === 'not_signed_in' && (
          <Link href="/login" className={primaryButtonClass('sm')}>
            Sign in
          </Link>
        )}
        {canHost && (
          <Link href="/events/new" className={primaryButtonClass('sm')}>
            Host an event
          </Link>
        )}
      </div>
    </div>
  );
}
