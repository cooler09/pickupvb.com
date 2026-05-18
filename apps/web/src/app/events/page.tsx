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
import { getServerSupabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/server-auth';
import { NearMeButton } from './near-me-button';
import { EventCard, type EventCardData } from './_components/event-card';
import { CommunityListingCard } from '@/app/community/_components/community-listing-card';
import {
  EventFilterForm,
  SURFACES,
  TYPES,
  SKILLS,
  type Skill,
  type Surface,
  type Type,
} from './_components/event-filter-form';
import { EventTimeframeTabs, type Timeframe } from './_components/event-timeframe-tabs';

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

function emptyMessage(when: Timeframe, reason: FollowingEmptyReason): string {
  if (when === 'past') return 'No past events match your filters.';
  if (when === 'following') {
    if (reason === 'not_signed_in') return 'Sign in to see events from people you follow.';
    if (reason === 'no_follows') {
      return "You're not following anyone yet. Follow players from any event page to see their upcoming events here.";
    }
    return 'No upcoming events from people you follow match your filters.';
  }
  return 'No upcoming events match your filters yet.';
}

export default async function EventsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, user } = await getCurrentUser();

  const get = (k: string): string | undefined => {
    const v = searchParams[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const lat = parseFloatOrNull(get('lat'));
  const lng = parseFloatOrNull(get('lng'));
  const radiusKm = parseFloatOrNull(get('radiusKm')) ?? 40;
  const surface: Surface | undefined = pick(get('surface'), SURFACES);
  const type: Type | undefined = pick(get('type'), TYPES);
  const skillLevel: Skill | undefined = pick(get('skill'), SKILLS);

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
          ...(skillLevel ? { skillLevel } : {}),
        }),
      );
      events = items.map((it) => ({
        id: it.id,
        title: it.title,
        surface: it.surface,
        skillLevel: it.skillLevel,
        type: it.type,
        startsAt: it.startsAt,
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
      ...(skillLevel ? { skillLevel } : {}),
    };

    const rawEvents = await handlers.searchEvents.execute(
      new SearchEventsQuery(user?.id ?? null, filters),
    );
    // RPC returns ascending. For past events, show newest first.
    events =
      when === 'past'
        ? [...rawEvents].sort(
            (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
          )
        : rawEvents;
  }

  // Community listings: only show on the upcoming tab, alongside platform events.
  // They share the same surface/skill filters and near-me geo. We always fetch
  // up to 6 to keep the section compact.
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
            ...(skillLevel ? { skillLevel } : {}),
          }),
        )
      : [];

  const hasLocation = lat !== null && lng !== null;

  // Build a query string that preserves filters across tab switches.
  const tabHref = (target: Timeframe): Route => {
    const params = new URLSearchParams();
    if (target !== 'upcoming') params.set('when', target);
    if (surface) params.set('surface', surface);
    if (type) params.set('type', type);
    if (skillLevel) params.set('skill', skillLevel);
    if (hasLocation && target !== 'following') {
      params.set('lat', String(lat));
      params.set('lng', String(lng));
      params.set('radiusKm', String(radiusKm));
    }
    const q = params.toString();
    return (q ? `/events?${q}` : '/events') as Route;
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Find events</h1>
        {user && (
          <Link
            href="/events/new"
            className="bg-primary hover:bg-primary/90 rounded-md px-4 py-2 font-medium text-white"
          >
            Host an event
          </Link>
        )}
      </div>

      {!user && (
        <p className="bg-highlight/30 rounded-md p-4 text-sm">
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>{' '}
          to join and host events.
        </p>
      )}

      <EventTimeframeTabs
        when={when}
        showFollowing={!!user}
        followingCount={friendIds.length}
        hrefFor={tabHref}
      />

      <EventFilterForm
        when={when}
        surface={surface}
        type={type}
        skillLevel={skillLevel}
        location={hasLocation ? { lat: lat!, lng: lng!, radiusKm } : null}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <NearMeButton />
        {hasLocation && (
          <Link href="/events" className="text-primary text-sm hover:underline">
            Clear location
          </Link>
        )}
      </div>

      {hasLocation && (
        <p className="text-muted text-sm">Showing events within {radiusKm} km of your location.</p>
      )}

      {events.length === 0 ? (
        <p className="bg-highlight/30 text-muted rounded-md p-6 text-center">
          {emptyMessage(when, followingEmptyReason)}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} {...(when === 'following' ? { friendNameById } : {})} />
          ))}
        </ul>
      )}

      {communityListings.length > 0 && (
        <section className="space-y-3 pt-2">
          <div className="flex items-end justify-between gap-2">
            <h2 className="text-xl font-semibold">From the community</h2>
            <Link href="/community" className="text-primary text-sm hover:underline">
              See all
            </Link>
          </div>
          <p className="text-muted text-sm">
            Events posted by players that aren&rsquo;t hosted on PickupVB. RSVP at the linked
            source.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {communityListings.map((listing) => (
              <CommunityListingCard
                key={listing.id}
                listing={{
                  slug: listing.slug,
                  title: listing.title,
                  externalHostName: listing.externalHostName,
                  startsAt: listing.startsAt,
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
    </section>
  );
}
