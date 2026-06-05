/**
 * Server component that emits a schema.org BreadcrumbList JSON-LD blob so
 * Google can render a breadcrumb trail in SERPs (rich breadcrumb result).
 *
 * Pass `trail` as the site-relative segments *below* Home — the implicit Home
 * crumb is prepended automatically. Each `path` is absolutized against
 * `PROD_APP_URL`: the spec ignores relative `item` URLs, and hand-typing the
 * apex (`https://pickupvb.com/...`) at every call site was an unchecked footgun
 * — a typo or a future domain flip silently voids the rich result with no
 * typecheck error. The leaf `path` should match the page's canonical, or Google
 * drops the breadcrumb.
 *
 * The implicit "Home" segment can be expressed two ways: either include it as
 * the first item, or omit it (Google treats the canonical apex as the implicit
 * root). We include it explicitly so the trail renders the way users expect.
 *
 * Shared across the four detail pages (`events`, `groups`, `players`, `teams`),
 * community listings, the host tools, and the event spectator surfaces.
 * Rendered via the shared `JsonLd` emitter so crumb names can't break out of
 * the inline script (see `components/json-ld.tsx`).
 */
import { JsonLd } from '@/components/json-ld';
import { PROD_APP_URL } from '@/lib/app-url';

export type Crumb = { name: string; path: string };

export function BreadcrumbJsonLd({ trail }: { trail: Crumb[] }) {
  const items: Crumb[] = [{ name: 'Home', path: '/' }, ...trail];
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: new URL(item.path, PROD_APP_URL).toString(),
    })),
  };

  return <JsonLd data={data} />;
}
