/**
 * Server component that emits a schema.org SportsOrganization JSON-LD blob
 * for search engines and AI crawlers. Inline `<script type="application/ld+json">`
 * is the canonical way to embed structured data in HTML.
 */
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

  return (
    <script
      type="application/ld+json"
      // schema.org JSON-LD; we control the values, no untrusted HTML.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
