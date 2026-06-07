/**
 * Server component that emits a schema.org SportsOrganization JSON-LD blob
 * for search engines and AI crawlers. Rendered via the shared `JsonLd` emitter
 * so user-controlled values (name, description) can't break out of the inline
 * script (see `components/json-ld.tsx`).
 */
import { JsonLd } from '@/components/json-ld';

export function GroupJsonLd({
  slug,
  name,
  description,
  homeCity,
  region,
  avatarUrl,
}: {
  slug: string;
  name: string;
  description: string | null;
  homeCity: string | null;
  region: string | null;
  avatarUrl: string | null;
}) {
  const url = `https://pickupvb.com/groups/${slug}`;
  const place = [homeCity, region].filter(Boolean).join(', ');
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name,
    sport: 'Volleyball',
    url,
    description: description
      ? description.slice(0, 500)
      : `${name}${place ? ` — ${place}` : ''}. A volleyball group on PickupVB.`,
    ...(avatarUrl ? { logo: avatarUrl } : {}),
    ...(homeCity || region
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(homeCity ? { addressLocality: homeCity } : {}),
            ...(region ? { addressRegion: region } : {}),
          },
        }
      : {}),
  };

  return <JsonLd data={data} />;
}
