import type { MetadataRoute } from 'next';
import { getServerSupabase } from '@/lib/supabase';

const BASE = 'https://pickupvb.com';

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
    const now = new Date();
    const staticRoutes: MetadataRoute.Sitemap = [
        { url: `${BASE}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
        { url: `${BASE}/events`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
        { url: `${BASE}/players`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
        { url: `${BASE}/teams`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
        { url: `${BASE}/groups`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
        { url: `${BASE}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
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

        const { data: groupRows } = await supabase
            .from('groups')
            .select('slug, updated_at');
        type GroupRow = { slug: string; updated_at: string | null };
        const groups = (groupRows as GroupRow[] | null) ?? [];
        const groupEntries: MetadataRoute.Sitemap = groups.map((g) => ({
            url: `${BASE}/groups/${g.slug}`,
            lastModified: g.updated_at ? new Date(g.updated_at) : now,
            changeFrequency: 'weekly',
            priority: 0.5,
        }));

        const { data: teamRows } = await supabase
            .from('teams')
            .select('slug, updated_at');
        type TeamRow = { slug: string; updated_at: string | null };
        const teams = (teamRows as TeamRow[] | null) ?? [];
        const teamEntries: MetadataRoute.Sitemap = teams.map((t) => ({
            url: `${BASE}/teams/${t.slug}`,
            lastModified: t.updated_at ? new Date(t.updated_at) : now,
            changeFrequency: 'weekly',
            priority: 0.5,
        }));

        const { data: playerRows } = await supabase
            .from('profiles')
            .select('handle, updated_at');
        type PlayerRow = { handle: string; updated_at: string | null };
        const players = (playerRows as PlayerRow[] | null) ?? [];
        const playerEntries: MetadataRoute.Sitemap = players.map((p) => ({
            url: `${BASE}/players/${p.handle}`,
            lastModified: p.updated_at ? new Date(p.updated_at) : now,
            changeFrequency: 'weekly',
            priority: 0.4,
        }));

        dynamicRoutes = [...eventEntries, ...groupEntries, ...teamEntries, ...playerEntries];
    } catch {
        // If Supabase is unreachable at build/crawl time, still serve the
        // static portion of the sitemap.
    }

    return [...staticRoutes, ...dynamicRoutes];
}
