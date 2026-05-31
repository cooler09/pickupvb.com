'use server';

import { SupabaseProfileRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';

export type PeopleSearchResult = {
  id: string;
  displayName: string;
  fullName: string;
  homeCity: string | null;
  avatarUrl: string | null;
};

/**
 * Free-text search over public profiles. Matches against display_name
 * (case-insensitive substring) via the `ProfileQueries` port, which reads the
 * PII-safe `profiles_public` view.
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

  const profiles = new SupabaseProfileRepository(await getServerSupabase());
  // Over-fetch by the exclude count, then post-filter (the JS client has no
  // NOT IN over arrays). Exclude lists are small (a roster, follow list, …).
  let cards;
  try {
    cards = await profiles.searchCards({ nameLike: q, limit: 10 + excludeIds.length });
  } catch {
    return [];
  }

  const skip = new Set(excludeIds);
  return cards
    .filter((c) => !skip.has(c.id))
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      displayName: c.displayName,
      fullName: c.displayName || 'Player',
      homeCity: c.homeCity,
      avatarUrl: c.avatarUrl,
    }));
}
