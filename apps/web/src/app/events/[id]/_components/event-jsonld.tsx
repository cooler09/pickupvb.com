/**
 * Server component that emits a schema.org SportsEvent JSON-LD blob for
 * search engines and AI crawlers (Google rich results, ChatGPT browse,
 * Perplexity, etc.). Inline `<script type="application/ld+json">` is the
 * canonical way to embed structured data in HTML. Rendered via the shared
 * `JsonLd` emitter so user-controlled values (title, description) can't break
 * out of the inline script (see `components/json-ld.tsx`).
 */
import { JsonLd } from '@/components/json-ld';

export function EventJsonLd({
  id,
  title,
  description,
  startsAt,
  endsAt,
  visibility,
  status,
  spotsRemaining,
  attendeeCount,
  location,
  organizerName,
  ticketCents,
}: {
  id: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  visibility: string;
  status: string;
  spotsRemaining: number | null;
  attendeeCount: number;
  location: {
    addressLine: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  organizerName: string | null;
  ticketCents: number | null;
}) {
  const url = `https://pickupvb.com/events/${id}`;
  const eventStatus =
    status === 'cancelled'
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled';
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: title,
    description: description || `Volleyball event on PickupVB — ${title}`,
    sport: 'Volleyball',
    startDate: startsAt.toISOString(),
    endDate: endsAt.toISOString(),
    eventStatus,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url,
    location: {
      '@type': 'Place',
      name: location.addressLine,
      address: {
        '@type': 'PostalAddress',
        streetAddress: location.addressLine,
        addressLocality: location.city,
        addressRegion: location.region,
        postalCode: location.postalCode,
        addressCountry: location.country,
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: location.latitude,
        longitude: location.longitude,
      },
    },
    ...(organizerName
      ? {
          organizer: {
            '@type': 'Organization',
            name: organizerName,
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      url,
      availability:
        spotsRemaining === 0 ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      price: ((ticketCents ?? 0) / 100).toFixed(2),
      priceCurrency: 'USD',
      category: ticketCents && ticketCents > 0 ? 'paid' : 'free',
    },
    // A RegisterAction makes the event *actionable* for AI agents and rich
    // results: it names "sign up" as the available action and points at the
    // canonical event URL where registration (or waitlist join) happens.
    // Omitted for cancelled events — there's nothing to register for.
    ...(status !== 'cancelled'
      ? {
          potentialAction: {
            '@type': 'RegisterAction',
            name: 'Sign up',
            target: { '@type': 'EntryPoint', urlTemplate: url },
          },
        }
      : {}),
    ...(visibility === 'public' ? { isAccessibleForFree: !ticketCents || ticketCents === 0 } : {}),
    maximumAttendeeCapacity: spotsRemaining === null ? undefined : attendeeCount + spotsRemaining,
    remainingAttendeeCapacity: spotsRemaining ?? undefined,
  };

  return <JsonLd data={data} />;
}
