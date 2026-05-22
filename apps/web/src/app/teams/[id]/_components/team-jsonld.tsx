/**
 * Server component that emits a schema.org SportsTeam JSON-LD blob for
 * search engines and AI crawlers. Inline `<script type="application/ld+json">`
 * is the canonical way to embed structured data in HTML.
 */
import { FORMAT_LABEL } from '@/lib/enum-labels';

export function TeamJsonLd({
  slug,
  name,
  format,
  memberCount,
}: {
  slug: string;
  name: string;
  format: string;
  memberCount: number;
}) {
  const url = `https://pickupvb.com/teams/${slug}`;
  const formatLabel = FORMAT_LABEL[format] ?? format;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name,
    sport: 'Volleyball',
    url,
    description: `${formatLabel} volleyball team on PickupVB.`,
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
