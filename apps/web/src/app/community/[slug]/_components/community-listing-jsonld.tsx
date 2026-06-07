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

export function CommunityListingJsonLd({
  title,
  slug,
  startsAt,
  endsAt,
  location,
}: {
  title: string;
  slug: string;
  startsAt: Date;
  endsAt: Date | null;
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
  const url = `https://pickupvb.com/community/${slug}`;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: title,
    sport: 'Volleyball',
    startDate: startsAt.toISOString(),
    ...(endsAt ? { endDate: endsAt.toISOString() } : {}),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url,
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
