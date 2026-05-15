'use server';

import { getServerSupabase } from '@/lib/supabase';

export type PeopleSearchResult = {
    id: string;
    displayName: string;
    fullName: string;
    homeCity: string | null;
    avatarUrl: string | null;
};

type Row = {
    id: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    home_city: string | null;
    avatar_url: string | null;
};

/**
 * Free-text search over public profiles. Matches against display_name,
 * first_name, and last_name (case-insensitive substring). Returns up to 10
 * results. Profiles are publicly readable per the `profiles_select` RLS
 * policy, but we still go through the user-scoped client so anonymous
 * sessions are honored.
 *
 * @param query  free-text search; empty / <2 chars returns []
 * @param excludeIds  ids that must not appear in results (already-rostered
 *                    users, the viewer themselves, etc.)
 */
export async function searchPeople(
    query: string,
    excludeIds: string[] = [],
): Promise<PeopleSearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const supabase = await getServerSupabase();

    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    // PostgREST has no native NOT IN over arrays in the JS client; fall back
    // to post-filtering when the exclude list is non-empty. Exclude lists are
    // expected to be small (a roster, follow list, etc.) so this is fine.
    const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, first_name, last_name, home_city, avatar_url')
        .or(
            `display_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`,
        )
        .limit(10 + excludeIds.length);
    if (error) return [];

    const skip = new Set(excludeIds);
    return ((data as Row[] | null) ?? [])
        .filter((p) => !skip.has(p.id))
        .slice(0, 10)
        .map((p) => {
            const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
            return {
                id: p.id,
                displayName: p.display_name,
                fullName: full || p.display_name || 'Player',
                homeCity: p.home_city,
                avatarUrl: p.avatar_url,
            };
        });
}
