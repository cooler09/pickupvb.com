/**
 * Friend-edge row → DTO mapping for the friendships table.
 *
 * Two callsites — `/profile` and `/friends` — previously inlined the
 * same select string, the same `OutRow` narrowing type, the same
 * null-filter on the embedded `profiles` join, and the same
 * incoming-edge `Set<userId>` query for mutual-friend detection. Per
 * the architecture audit P2 "mapper extraction" recommendation, that
 * shared shape lives here as one helper.
 *
 * Extending this file: keep it pure (no `revalidatePath`, no Next/React
 * imports) so it stays callable from both server components and route
 * handlers. If a new caller needs only one of the two edges, expose a
 * narrower helper instead of forcing the second round-trip on it.
 */

import { getServerSupabase } from '../supabase';

type SupabaseClient = Awaited<ReturnType<typeof getServerSupabase>>;

/** Camel-case-adjacent DTO. Field names match the underlying `profiles` columns
 *  because the consumers (`FriendsList`, the profile-page Following section)
 *  already render snake_case directly — flipping that is a separate bundle. */
export type FriendProfile = {
  id: string;
  handle: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  home_city: string | null;
};

const FRIEND_PROFILE_COLUMNS =
  'friend_id, profiles:profiles!friendships_friend_id_fkey(id, handle, display_name, first_name, last_name, avatar_url, home_city)';

type OutRow = { friend_id: string; profiles: FriendProfile | null };

/**
 * Load the outgoing friend edges (people `userId` follows) and the set of
 * incoming-edge user ids (people who follow `userId`) in one round-trip
 * via `Promise.all`. The incoming set is intersected client-side at the
 * call site to flag mutual friendships in the UI.
 *
 * Returns empty arrays / set when either query errors or returns null —
 * matching the previous inlined behaviour (the friends page rendered an
 * empty list rather than throwing on a Supabase blip).
 */
export async function loadFriendEdges(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ friends: FriendProfile[]; mutualIds: Set<string> }> {
  const [outRes, inRes] = await Promise.all([
    supabase.from('friendships').select(FRIEND_PROFILE_COLUMNS).eq('user_id', userId),
    supabase.from('friendships').select('user_id').eq('friend_id', userId),
  ]);

  const out = (outRes.data as OutRow[] | null) ?? [];
  const friends = out.map((r) => r.profiles).filter((p): p is FriendProfile => p !== null);

  const mutualIds = new Set(
    ((inRes.data as { user_id: string }[] | null) ?? []).map((r) => r.user_id),
  );

  return { friends, mutualIds };
}
