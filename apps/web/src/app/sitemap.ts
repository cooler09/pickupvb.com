import type { MetadataRoute } from 'next';
import { SupabaseGroupQueryRepository } from '@pickupvb/infrastructure';
import { createSupabaseAnonClient } from '@pickupvb/supabase/anon';
import { IS_PROD_HOST, PROD_APP_URL } from '@/lib/app-url';
import { legalLastUpdatedDate } from './legal/legal-meta';

const BASE = PROD_APP_URL;

// Sitemap is the single most-crawled endpoint and serves identical,
// viewer-independent public content to every crawler. Use the cookie-free
// anon client (so the route can be cached — `getServerSupabase()` reads
// `cookies()`, which forces every crawl to be a fresh origin render) and
// revalidate hourly. Newly-published events show up within the hour; mutating
// actions don't need to evict it (perf audit P2 #21).
export const revalidate = 3600;

/**
 * Sitemap. Lists static marketing/listing pages plus all public,
 * non-cancelled events and public group profiles. Uses the anon
 * Supabase client — RLS naturally filters down to public rows.
 *
 * ISR-cached (1h revalidate) so a recrawl doesn't re-run these queries every
 * time. If/when the catalog grows large enough that the full reads are slow,
 * switch to a generator that paginates.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Non-prod deployments return an empty sitemap so dev/preview content
  // never enters search indexes. robots.txt also disallows everything.
  if (!IS_PROD_HOST) return [];
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/events`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE}/players`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${BASE}/teams`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${BASE}/groups`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${BASE}/community`, lastModified: now, changeFrequency: 'daily', priority: 0.5 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE}/about/numbers`, lastModified: now, changeFrequency: 'daily', priority: 0.4 },
    { url: `${BASE}/tools`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    {
      url: `${BASE}/tools/scoreboard`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE}/tools/team-randomizer`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE}/tools/scheduler`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE}/tools/seeding`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE}/tools/timer`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE}/tools/rotation`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE}/tools/standings`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    // Stable legal pages — footer-linked, so Google finds them anyway, but
    // advertising them in the sitemap closes the discovery gap. `lastModified`
    // tracks each page's real document date (legal-meta.ts), not build time.
    {
      url: `${BASE}/legal/privacy`,
      lastModified: legalLastUpdatedDate('privacy'),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${BASE}/legal/terms`,
      lastModified: legalLastUpdatedDate('terms'),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${BASE}/legal/refunds`,
      lastModified: legalLastUpdatedDate('refunds'),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${BASE}/legal/accessibility`,
      lastModified: legalLastUpdatedDate('accessibility'),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ];

  let dynamicRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = createSupabaseAnonClient();

    const { data: eventRows } = await supabase
      .from('events_view')
      .select('id, updated_at, starts_at, visibility, status')
      .eq('visibility', 'public')
      .neq('status', 'draft')
      .neq('status', 'cancelled')
      .gte('starts_at', new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString());
    type EventRow = {
      id: string;
      updated_at: string | null;
      starts_at: string;
    };
    const events = (eventRows as EventRow[] | null) ?? [];
    const eventEntries: MetadataRoute.Sitemap = events.map((e) => ({
      url: `${BASE}/events/${e.id}`,
      lastModified: e.updated_at ? new Date(e.updated_at) : new Date(e.starts_at),
      changeFrequency: 'hourly',
      priority: 0.8,
    }));

    const groups = await new SupabaseGroupQueryRepository(supabase).listSlugs();
    const groupEntries: MetadataRoute.Sitemap = groups.map((g) => ({
      url: `${BASE}/groups/${g.slug}`,
      lastModified: g.updatedAt ? new Date(g.updatedAt) : now,
      changeFrequency: 'weekly',
      priority: 0.5,
    }));

    const { data: teamRows } = await supabase.from('teams').select('slug, updated_at');
    type TeamRow = { slug: string; updated_at: string | null };
    const teams = (teamRows as TeamRow[] | null) ?? [];
    const teamEntries: MetadataRoute.Sitemap = teams.map((t) => ({
      url: `${BASE}/teams/${t.slug}`,
      lastModified: t.updated_at ? new Date(t.updated_at) : now,
      changeFrequency: 'weekly',
      priority: 0.5,
    }));

    // Only advertise players who opted into discovery. A `discoverable = false`
    // player keeps a direct-link-reachable page (documented decision, privacy.md)
    // but is excluded from the sitemap and de-indexed in `generateMetadata` —
    // otherwise "stay private" still ends up crawled.
    const { data: playerRows } = await supabase
      .from('profiles_public')
      .select('handle, created_at')
      .eq('discoverable', true);
    type PlayerRow = { handle: string; created_at: string | null };
    const players = (playerRows as PlayerRow[] | null) ?? [];
    const playerEntries: MetadataRoute.Sitemap = players.map((p) => ({
      url: `${BASE}/players/${p.handle}`,
      lastModified: p.created_at ? new Date(p.created_at) : now,
      changeFrequency: 'weekly',
      priority: 0.4,
    }));

    // Community listings: only the statuses the detail page treats as
    // indexable (`active` / `claim_pending` — see community/[slug]/page.tsx),
    // so the sitemap never advertises a URL that renders `noindex`.
    const { data: listingRows } = await supabase
      .from('community_listings')
      .select('slug, updated_at')
      .in('status', ['active', 'claim_pending'])
      .not('slug', 'is', null);
    type ListingRow = { slug: string | null; updated_at: string | null };
    const listings = (listingRows as ListingRow[] | null) ?? [];
    const communityEntries: MetadataRoute.Sitemap = listings.flatMap((l) =>
      l.slug
        ? [
            {
              url: `${BASE}/community/${l.slug}`,
              lastModified: l.updated_at ? new Date(l.updated_at) : now,
              changeFrequency: 'daily' as const,
              priority: 0.5,
            },
          ]
        : [],
    );

    dynamicRoutes = [
      ...eventEntries,
      ...groupEntries,
      ...teamEntries,
      ...playerEntries,
      ...communityEntries,
    ];
  } catch {
    // If Supabase is unreachable at build/crawl time, still serve the
    // static portion of the sitemap.
  }

  return [...staticRoutes, ...dynamicRoutes];
}
