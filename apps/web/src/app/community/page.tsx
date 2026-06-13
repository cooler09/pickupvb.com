import Link from 'next/link';
import { primaryButtonClass } from '@/components/primary-button';
import { fieldInputClass } from '@/components/field-styles';
import type { Metadata } from 'next/types';
import { SURFACE_LABEL, FORMAT_LABEL, SKILL_LABEL } from '@/lib/enum-labels';
import { eventBucket } from '@/lib/date-formats';
import { repositories } from '@/lib/handlers';
import { Pagination } from '@/components/pagination';
import { NearMeButton } from '../events/near-me-button';
import { LocationSearch } from '../events/location-search';
import { CommunityListingCard } from './_components/community-listing-card';
import { CommunitySubmitActions } from './_components/community-submit-actions';
import { MyHiddenCommunityListings } from './_components/my-hidden-community-listings';
import PinMapLazy from '@/components/pin-map-lazy';
import type { MapPin } from '@/components/pin-map';
import { JsonLd } from '@/components/json-ld';
import { PROD_APP_URL } from '@/lib/app-url';

// ISR: the public (viewer-`null`) list is identical for every logged-out visitor
// + crawler, so it serves per-URL (filters/page live in `searchParams`) from the
// edge for 60s. The page reads no `cookies()` — the "Submit"/admin CTA and the
// submitter's own hidden-listing recovery strip resolve in client islands — so
// the response is shared, not `private`. Performance audit P3 #17.
export const revalidate = 60;

const SURFACES = ['indoor', 'grass', 'sand'] as const;
const FORMATS = ['sixes', 'quads', 'triples', 'doubles'] as const;
const SKILLS = ['beginner', 'intermediate', 'advanced', 'competitive'] as const;
const WHENS = ['upcoming', 'past'] as const;
const VIEWS = ['list', 'map'] as const;
const PER_PAGE = 24;
const DEFAULT_RADIUS_KM = 40;

type Surface = (typeof SURFACES)[number];
type Format = (typeof FORMATS)[number];
type Skill = (typeof SKILLS)[number];
type When = (typeof WHENS)[number];
type View = (typeof VIEWS)[number];

export async function generateMetadata(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await props.searchParams;
  // Keep the bare `/community` page indexable; noindex thin filter/page/tab
  // permutations so crawlers don't burn budget on near-duplicate slices. They
  // all canonicalize to `/community`, and `follow: true` lets link equity flow.
  const isFilteredOrPaged =
    sp['surface'] != null ||
    sp['format'] != null ||
    sp['skill'] != null ||
    sp['lat'] != null ||
    sp['when'] === 'past' ||
    sp['view'] === 'map' ||
    (sp['page'] != null && sp['page'] !== '1');
  return {
    title: 'Community listings',
    description:
      'Volleyball events shared by the PickupVB community. Submit a Facebook post, Meetup, or other external event so others in your area can find it.',
    alternates: { canonical: '/community' },
    openGraph: {
      title: 'Community listings · PickupVB',
      description:
        'Discover volleyball events posted by the community — outbound links to Facebook, Meetup, and more.',
      url: '/community',
      type: 'website',
    },
    ...(isFilteredOrPaged ? { robots: { index: false, follow: true } } : {}),
  };
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function parseNum(value: string | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export default async function CommunityListingsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;

  const get = (k: string): string | undefined => {
    const v = searchParams[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const surface: Surface | undefined = pick(get('surface'), SURFACES);
  const format: Format | undefined = pick(get('format'), FORMATS);
  const skillLevel: Skill | undefined = pick(get('skill'), SKILLS);
  const when: When = pick(get('when'), WHENS) ?? 'upcoming';
  const isPast = when === 'past';
  const view: View = pick(get('view'), VIEWS) ?? 'list';
  const page = Math.max(1, Number.parseInt(get('page') ?? '1', 10) || 1);

  // Optional "near me" / city search. `lat`/`lng`/`radiusKm` are written by the
  // shared LocationSearch + NearMeButton controls (same as /events); when
  // present we hand `near` to the geo RPC path, which orders by distance.
  const lat = parseNum(get('lat'));
  const lng = parseNum(get('lng'));
  const radiusKm = parseNum(get('radiusKm')) ?? DEFAULT_RADIUS_KM;
  // Narrowed once so every downstream dereference (query, links, hidden inputs)
  // type-checks without repeating the null guard.
  const near = lat !== null && lng !== null ? { latitude: lat, longitude: lng, radiusKm } : null;

  const now = new Date();
  // Boundary between "past" and "upcoming" is the **start of today** (UTC), not
  // `now` — otherwise an all-day listing anchored at noon would flip to "past"
  // (and drop out of the "Today" group) once the clock passes noon. Flooring to
  // the UTC day keeps today's events in the upcoming view all day.
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // Shared filters for both the page query and the map query. Upcoming:
  // soonest-first. Past: most-recent-first so the freshest history leads.
  // viewer-`null`: the cached list is the public view; a signed-in submitter's
  // own hidden listings are surfaced separately by <MyHiddenCommunityListings />
  // so the page stays cookie-free (P3 #17).
  const filters = {
    ...(isPast
      ? { startsBefore: startOfToday, order: 'desc' as const }
      : { startsAfter: startOfToday }),
    ...(near ? { near } : {}),
    ...(surface ? { surface } : {}),
    ...(format ? { format } : {}),
    ...(skillLevel ? { skillLevel } : {}),
  };

  // Real keyset pagination: fetch only this page's slice + the total count, so
  // the directory scales past PostgREST's `max_rows` (the old FETCH_CAP window
  // capped the whole page — incl. the map — at 120). CL-6.
  const { rows: listings, total } = await repositories.communityListingRepo.searchPage({
    ...filters,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  });

  // Upcoming list view groups the page's cards into "Today / Tomorrow / This
  // week / Next week / Later" sections (computed in each event's own timezone
  // vs. `now`). Listings are already sorted soonest-first, so buckets come out
  // in order; a bucket may continue onto the next page, which just re-shows its
  // header. Past/map views aren't grouped.
  const groupedListings: { label: string; items: typeof listings }[] = [];
  if (!isPast) {
    const byOrder = new Map<number, { label: string; items: typeof listings }>();
    for (const l of listings) {
      const { order, label } = eventBucket(l.startsAt, l.timeZone ?? null, now);
      const g = byOrder.get(order) ?? { label, items: [] };
      g.items.push(l);
      byOrder.set(order, g);
    }
    groupedListings.push(...[...byOrder.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g));
  }

  // `ItemList` JSON-LD for the index, so crawlers see an explicit, ordered list
  // of the listing URLs (a discovery hint on top of the in-page <a>s). Emit it
  // only on the indexable canonical page — the bare, unfiltered, unpaged list
  // view — matching the same predicate `generateMetadata` uses to `noindex`
  // filter/page/tab/map permutations, so we don't attach structured data to a
  // near-duplicate slice.
  const isCanonicalList =
    view === 'list' &&
    page === 1 &&
    !isPast &&
    !surface &&
    !format &&
    !skillLevel &&
    near === null &&
    listings.length > 0;
  const itemListJsonLd = isCanonicalList
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: listings.map((l, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${PROD_APP_URL}/community/${l.slug}`,
          name: l.title,
        })),
      }
    : null;

  // Map view plots EVERY matching listing with coordinates (the whole heatmap,
  // not just one page) — so it gets its own fetch that pages past max_rows, only
  // when actually on the map to keep the list view light. `listMapPins` already
  // filters to coord-bearing rows.
  const mapPins: MapPin[] =
    view === 'map'
      ? (await repositories.communityListingRepo.listMapPins(filters)).map((p) => ({
          href: `/community/${p.slug}`,
          title: p.title,
          subtitle: [p.city, p.region].filter(Boolean).join(', ') || null,
          latitude: p.latitude,
          longitude: p.longitude,
        }))
      : [];

  // Preserve the active view (map) across tab / filter-clear navigations. List
  // is the default, so it carries no param.
  const viewParam: Record<string, string> = view === 'map' ? { view: 'map' } : {};

  // Non-location filters, preserved across the "clear location" link.
  const baseFilterQuery: Record<string, string> = {
    ...(surface ? { surface } : {}),
    ...(format ? { format } : {}),
    ...(skillLevel ? { skill: skillLevel } : {}),
  };
  // All active state, preserved when switching tabs / applying filters / paging.
  const filterQuery: Record<string, string> = {
    ...baseFilterQuery,
    ...(near
      ? {
          lat: near.latitude.toFixed(6),
          lng: near.longitude.toFixed(6),
          radiusKm: String(radiusKm),
        }
      : {}),
  };
  // "Clear filters" drops the surface/format/skill dropdowns but keeps the tab +
  // any active location (which has its own "Clear location" affordance). (CU-6)
  const hasFilters = Boolean(surface || format || skillLevel);
  const clearFiltersQuery: Record<string, string> = {
    when,
    ...viewParam,
    ...(near
      ? {
          lat: near.latitude.toFixed(6),
          lng: near.longitude.toFixed(6),
          radiusKm: String(radiusKm),
        }
      : {}),
  };

  return (
    <section className="space-y-6">
      {itemListJsonLd && <JsonLd data={itemListJsonLd} />}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-headline-lg font-bold">
            Community listings <span className="text-muted text-base font-normal">· {total}</span>
          </h1>
          <p className="text-muted mt-1 max-w-2xl text-sm">
            Volleyball events shared by other players — Facebook posts, Meetup groups, and other
            links from around the web. Anyone can submit a listing for an event they&rsquo;re not
            hosting.
          </p>
        </div>
        <CommunitySubmitActions />
      </div>

      <div className="border-border-base flex gap-1 border-b">
        <Link
          href={{
            pathname: '/community',
            query: { ...filterQuery, ...viewParam, when: 'upcoming' },
          }}
          aria-current={!isPast ? 'page' : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            !isPast ? 'border-primary text-primary' : 'text-muted hover:text-fg border-transparent'
          }`}
        >
          Upcoming
        </Link>
        <Link
          href={{ pathname: '/community', query: { ...filterQuery, ...viewParam, when: 'past' } }}
          aria-current={isPast ? 'page' : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            isPast ? 'border-primary text-primary' : 'text-muted hover:text-fg border-transparent'
          }`}
        >
          Past
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <LocationSearch basePath="/community" />
        <NearMeButton basePath="/community" />
        {near && (
          <span className="text-muted text-sm">
            Within {radiusKm} km ·{' '}
            <Link
              href={{ pathname: '/community', query: { ...baseFilterQuery, ...viewParam, when } }}
              className="text-primary hover:underline"
            >
              Clear location
            </Link>
          </span>
        )}
        <div className="border-border-base rounded-shape-sm ml-auto flex border p-0.5">
          <Link
            href={{ pathname: '/community', query: { ...filterQuery, when } }}
            aria-current={view === 'list' ? 'page' : undefined}
            className={`rounded-[0.3rem] px-3 py-1 text-sm font-medium ${
              view === 'list' ? 'bg-fg/10 text-fg' : 'text-muted hover:text-fg hover:bg-fg/5'
            }`}
          >
            List
          </Link>
          <Link
            href={{ pathname: '/community', query: { ...filterQuery, when, view: 'map' } }}
            aria-current={view === 'map' ? 'page' : undefined}
            className={`rounded-[0.3rem] px-3 py-1 text-sm font-medium ${
              view === 'map' ? 'bg-fg/10 text-fg' : 'text-muted hover:text-fg hover:bg-fg/5'
            }`}
          >
            Map
          </Link>
        </div>
      </div>

      <form
        method="get"
        className="border-border-base bg-md-surface-container rounded-shape-sm grid gap-3 border p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <input type="hidden" name="when" value={when} />
        {/* Preserve an active location across an Apply (the GET form would
            otherwise drop these and reset to a non-geo search). */}
        {near && (
          <>
            <input type="hidden" name="lat" value={near.latitude.toFixed(6)} />
            <input type="hidden" name="lng" value={near.longitude.toFixed(6)} />
            <input type="hidden" name="radiusKm" value={String(radiusKm)} />
          </>
        )}
        <label className="text-sm">
          <span className="text-muted block text-xs font-semibold tracking-wide uppercase">
            Surface
          </span>
          <select name="surface" defaultValue={surface ?? ''} className={fieldInputClass}>
            <option value="">Any</option>
            {SURFACES.map((s) => (
              <option key={s} value={s}>
                {SURFACE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted block text-xs font-semibold tracking-wide uppercase">
            Format
          </span>
          <select name="format" defaultValue={format ?? ''} className={fieldInputClass}>
            <option value="">Any</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted block text-xs font-semibold tracking-wide uppercase">
            Skill
          </span>
          <select name="skill" defaultValue={skillLevel ?? ''} className={fieldInputClass}>
            <option value="">Any</option>
            {SKILLS.map((s) => (
              <option key={s} value={s}>
                {SKILL_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className={primaryButtonClass('md')}>
            Apply
          </button>
        </div>
      </form>

      {hasFilters && (
        <p className="-mt-3 text-sm">
          <Link
            href={{ pathname: '/community', query: clearFiltersQuery }}
            className="text-primary hover:underline"
          >
            Clear filters
          </Link>
        </p>
      )}

      <p className="bg-md-warning/10 text-md-warning rounded-md p-3 text-xs">
        Community listings link out to external sites. PickupVB doesn&rsquo;t verify or moderate the
        events themselves. RSVP and pay through the linked source.
      </p>

      <MyHiddenCommunityListings />

      {view === 'map' ? (
        mapPins.length === 0 ? (
          <p className="bg-highlight/30 text-muted rounded-md p-6 text-center">
            {total === 0
              ? 'No community listings match your filters.'
              : `None of the ${total} matching ${
                  total === 1 ? 'listing has' : 'listings have'
                } a mapped location yet.`}{' '}
            <Link
              href={{ pathname: '/community', query: { ...filterQuery, when } }}
              className="text-primary font-semibold hover:underline"
            >
              View as list
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-2">
            <PinMapLazy pins={mapPins} />
            {mapPins.length < total && (
              <p className="text-muted text-xs">
                Showing {mapPins.length} of {total} listings that have a mapped location — the rest
                are visible in{' '}
                <Link
                  href={{ pathname: '/community', query: { ...filterQuery, when } }}
                  className="text-primary hover:underline"
                >
                  list view
                </Link>
                .
              </p>
            )}
          </div>
        )
      ) : listings.length === 0 ? (
        <p className="bg-highlight/30 text-muted rounded-md p-6 text-center">
          {near ? (
            <>
              No community listings within {radiusKm} km match your filters.{' '}
              <Link
                href={{ pathname: '/community', query: { ...baseFilterQuery, when } }}
                className="text-primary font-semibold hover:underline"
              >
                Clear the location filter
              </Link>{' '}
              to see all{isPast ? ' past' : ' upcoming'} listings.
            </>
          ) : isPast ? (
            hasFilters ? (
              <>
                No past community listings match your filters.{' '}
                <Link
                  href={{ pathname: '/community', query: clearFiltersQuery }}
                  className="text-primary font-semibold hover:underline"
                >
                  Clear filters
                </Link>
                .
              </>
            ) : (
              'No past community listings match your filters.'
            )
          ) : hasFilters ? (
            <>
              No upcoming community listings match your filters.{' '}
              <Link
                href={{ pathname: '/community', query: clearFiltersQuery }}
                className="text-primary font-semibold hover:underline"
              >
                Clear filters
              </Link>{' '}
              or{' '}
              <Link href="/community/new" className="text-primary font-semibold hover:underline">
                submit one
              </Link>
              .
            </>
          ) : (
            <>
              No upcoming community listings match your filters yet. Know about an event we should
              add?{' '}
              <Link href="/community/new" className="text-primary font-semibold hover:underline">
                Submit one.
              </Link>
            </>
          )}
        </p>
      ) : (
        <>
          {isPast ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l) => (
                <CommunityListingCard key={l.id} listing={l} />
              ))}
            </ul>
          ) : (
            <div className="space-y-6">
              {groupedListings.map((g) => (
                <div key={g.label}>
                  <h2 className="text-title-lg mb-3 font-semibold">
                    {g.label}{' '}
                    <span className="text-muted text-base font-normal">· {g.items.length}</span>
                  </h2>
                  <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {g.items.map((l) => (
                      <CommunityListingCard key={l.id} listing={l} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <Pagination
            basePath="/community"
            page={page}
            pageSize={PER_PAGE}
            total={total}
            searchParams={{ ...filterQuery, when }}
          />
        </>
      )}
    </section>
  );
}
