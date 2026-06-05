import type { MetadataRoute } from 'next';
import { SupabaseGroupQueryRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';
import { IS_PROD_HOST, PROD_APP_URL } from '@/lib/app-url';

const BASE = PROD_APP_URL;

/**
 * Sitemap. Lists static marketing/listing pages plus all public,
 * non-cancelled events and public group profiles. Uses the anon
 * Supabase session — RLS naturally filters down to public rows.
 *
 * Re-fetched on each crawl (no caching) so newly-published events show
 * up fast. If/when the catalog grows large enough that this is slow,
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
    // advertising them in the sitemap closes the discovery gap.
    { url: `${BASE}/legal/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/legal/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/legal/refunds`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];

  let dynamicRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = await getServerSupabase();

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

    const { data: playerRows } = await supabase
      .from('profiles_public')
      .select('handle, created_at');
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
