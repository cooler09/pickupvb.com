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

/** Camel-case-adjacent DTO. Field names match the underlying `profiles_public`
 *  columns. first_name / last_name are not in the public view and are omitted. */
export type FriendProfile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  home_city: string | null;
};

/**
 * Load the outgoing friend edges (people `userId` follows) and the set of
 * incoming-edge user ids (people who follow `userId`) in one round-trip
 * via `Promise.all`. The incoming set is intersected client-side at the
 * call site to flag mutual friendships in the UI.
 *
 * Profiles are read from `profiles_public` (no FK join syntax — views carry
 * no FK relationships in PostgREST) via a separate IN query merged in JS.
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
    supabase.from('friendships').select('friend_id').eq('user_id', userId),
    supabase.from('friendships').select('user_id').eq('friend_id', userId),
  ]);

  const friendIds = ((outRes.data as { friend_id: string }[] | null) ?? []).map((r) => r.friend_id);

  let friends: FriendProfile[] = [];
  if (friendIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles_public')
      .select('id, handle, display_name, avatar_url, home_city')
      .in('id', friendIds);
    friends = (profileRows as FriendProfile[] | null) ?? [];
  }

  const mutualIds = new Set(
    ((inRes.data as { user_id: string }[] | null) ?? []).map((r) => r.user_id),
  );

  return { friends, mutualIds };
}
