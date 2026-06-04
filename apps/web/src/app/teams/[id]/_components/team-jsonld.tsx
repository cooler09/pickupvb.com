/**
 * Server component that emits a schema.org SportsTeam JSON-LD blob for
 * search engines and AI crawlers. Inline `<script type="application/ld+json">`
 * is the canonical way to embed structured data in HTML.
 */
export function TeamJsonLd({
  slug,
  name,
  memberCount,
}: {
  slug: string;
  name: string;
  memberCount: number;
}) {
  const url = `https://pickupvb.com/teams/${slug}`;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name,
    sport: 'Volleyball',
    url,
    description: `${name} — volleyball team on PickupVB.`,
    numberOfPlayers: memberCount,
  };

  return (
    <script
      type="application/ld+json"
      // schema.org JSON-LD; we control the values, no untrusted HTML.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
