/**
 * Server component that emits a schema.org BreadcrumbList JSON-LD blob so
 * Google can render a breadcrumb trail in SERPs (rich breadcrumb result).
 * Per the spec, each `item` URL must be absolute — relative URLs are
 * ignored. Shared across `events/[id]`, `groups/[id]`, `players/[id]`,
 * and `teams/[id]` detail pages.
 *
 * The implicit "Home" segment can be expressed two ways: either include it
 * as the first item, or omit it (Google treats the canonical apex as the
 * implicit root). We include it explicitly so the trail renders the way
 * users expect.
 */
export function BreadcrumbJsonLd({ items }: { items: { name: string; url: string }[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      // schema.org JSON-LD; we control the values, no untrusted HTML.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
