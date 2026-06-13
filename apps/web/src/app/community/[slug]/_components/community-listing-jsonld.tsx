/**
 * schema.org SportsEvent JSON-LD for a community listing (SEO audit P3 #9).
 * Community listings represent real volleyball events, so we mirror the
 * `event-jsonld.tsx` shape (sport: Volleyball, offline attendance) but keep it
 * minimal — these are externally-hosted events we don't own the registration
 * for, so there are no `offers` / capacity signals. Rendered via the shared
 * `JsonLd` emitter so the user-controlled title can't break out of the inline
 * script (see `components/json-ld.tsx`).
 */
import { JsonLd } from '@/components/json-ld';
import { PROD_APP_URL } from '@/lib/app-url';

/** Calendar date (`YYYY-MM-DD`) of an instant in `tz` — schema.org's date-only form. */
function ymdInZone(d: Date, timeZone: string | null): string {
  return new Intl.DateTimeFormat('en-CA', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function CommunityListingJsonLd({
  title,
  slug,
  description,
  externalUrl,
  startsAt,
  endsAt,
  allDay,
  timeZone,
  location,
}: {
  title: string;
  slug: string;
  /** The submitter's free-text description; falls back to a generated blurb. */
  description: string;
  /** The off-platform source (Facebook/Meetup/league page) this listing points at. */
  externalUrl: string;
  startsAt: Date;
  endsAt: Date | null;
  /** When true, emit a date-only `startDate` (no fabricated clock time). */
  allDay: boolean;
  timeZone: string | null;
  location: {
    addressLine: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    country: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
}) {
  const url = `${PROD_APP_URL}/community/${slug}`;
  const place = location ? [location.city, location.region].filter(Boolean).join(', ') : '';
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: title,
    description: description.trim()
      ? description.trim().slice(0, 300)
      : `${place ? `${place} · ` : ''}Community-submitted volleyball event on PickupVB.`,
    sport: 'Volleyball',
    // All-day listings carry only a calendar date (no real start time), so emit
    // the schema.org date-only form rather than a misleading midnight/noon clock.
    startDate: allDay ? ymdInZone(startsAt, timeZone) : startsAt.toISOString(),
    ...(endsAt ? { endDate: allDay ? ymdInZone(endsAt, timeZone) : endsAt.toISOString() } : {}),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url,
    // The tailored OG card (community/[slug]/opengraph-image.tsx) doubles as the
    // event image for rich results.
    image: `${url}/opengraph-image`,
    // `sameAs` is the entity-identity signal: it tells search engines this page
    // describes the *same* event that lives at the external source (the Facebook
    // post / Meetup / league page the listing links out to). This is what lets a
    // PickupVB community listing surface for searches about that off-platform
    // event, without passing link equity out of an indexable hyperlink (the
    // outbound CTA stays `rel="ugc nofollow"` + routes through `/leaving`).
    sameAs: [externalUrl],
    ...(location
      ? {
          location: {
            '@type': 'Place',
            ...(location.addressLine ? { name: location.addressLine } : {}),
            address: {
              '@type': 'PostalAddress',
              ...(location.addressLine ? { streetAddress: location.addressLine } : {}),
              addressLocality: location.city,
              ...(location.region ? { addressRegion: location.region } : {}),
              ...(location.postalCode ? { postalCode: location.postalCode } : {}),
              addressCountry: location.country,
            },
            // Only emit coordinates when the address was geocoded.
            ...(location.latitude !== null && location.longitude !== null
              ? {
                  geo: {
                    '@type': 'GeoCoordinates',
                    latitude: location.latitude,
                    longitude: location.longitude,
                  },
                }
              : {}),
          },
        }
      : {}),
  };

  return <JsonLd data={data} />;
}
