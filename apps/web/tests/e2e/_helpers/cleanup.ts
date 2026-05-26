import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@pickupvb/supabase';

/**
 * E2E fixture cleanup helper.
 *
 * Centralizes the admin-Supabase plumbing for `afterAll` hooks that need
 * to hard-delete rows the suite created (groups, teams, events) when the
 * UI exposes no delete path. Per docs/audits/data-lifecycle.md P2 #4, the
 * `dev.pickupvb.com` database accumulates leaked `E2E Test ...` rows
 * across runs (the audit's "cohost dropdown shows 27 groups" finding).
 *
 * # Enablement
 *
 * Cleanup is **opt-in**. The helper reads two dedicated env vars rather
 * than the app's `SUPABASE_URL` / `SUPABASE_SECRET_KEY` so a developer
 * running e2e against a project they don't own can't accidentally
 * delete data:
 *
 *   E2E_CLEANUP_SUPABASE_URL          - PostgREST URL of the target project
 *   E2E_CLEANUP_SUPABASE_SECRET_KEY   - service-role / sb_secret_ key
 *
 * If either is unset, every helper here is a no-op and logs once. CI
 * and the maintainer's local runs are expected to set both; ad-hoc
 * runs are expected to leak (and rely on the periodic sweep).
 *
 * # What to clean
 *
 * Spec-owned `afterAll` hooks should delete the specific id they created.
 * `sweepLeakedE2EFixtures()` is a broader safety net keyed off the
 * `E2E Test %` name convention; intended for a maintenance script /
 * `globalTeardown`, not per-spec `afterAll`.
 */

let warnedMissingEnv = false;
let cachedClient: SupabaseClient<Database> | null = null;

/**
 * Returns the admin client, or `null` if cleanup is not configured.
 * Callers should treat `null` as "skip cleanup quietly".
 */
export function getCleanupClient(): SupabaseClient<Database> | null {
  if (cachedClient) return cachedClient;
  const url = process.env['E2E_CLEANUP_SUPABASE_URL'];
  const key = process.env['E2E_CLEANUP_SUPABASE_SECRET_KEY'];
  if (!url || !key) {
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      console.warn(
        '[e2e cleanup] E2E_CLEANUP_SUPABASE_URL / E2E_CLEANUP_SUPABASE_SECRET_KEY not set — fixture cleanup is disabled. See tests/e2e/_helpers/cleanup.ts.',
      );
    }
    return null;
  }
  cachedClient = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedClient;
}

// ---------------------------------------------------------------------------
// Targeted deletes — call from per-spec `afterAll` with the id you created.
// All helpers are safe to call when cleanup is disabled (no-op) and when
// the row no longer exists (silent).
// ---------------------------------------------------------------------------

export async function deleteGroupBySlug(slug: string): Promise<void> {
  const c = getCleanupClient();
  if (!c) return;
  await c.from('groups').delete().eq('slug', slug);
}

export async function deleteTeamBySlug(slug: string): Promise<void> {
  const c = getCleanupClient();
  if (!c) return;
  await c.from('teams').delete().eq('slug', slug);
}

/**
 * Hard-delete an event by id. Use only for spec-owned fixtures; production
 * event deletion is event cancellation (status='cancelled'), not a hard
 * delete. CASCADE clears attendees / teams / divisions / brackets.
 */
export async function deleteEventById(id: string): Promise<void> {
  const c = getCleanupClient();
  if (!c) return;
  await c.from('events').delete().eq('id', id);
}

export async function deleteCommunityListingBySlug(slug: string): Promise<void> {
  const c = getCleanupClient();
  if (!c) return;
  await c.from('community_listings').delete().eq('slug', slug);
}

// ---------------------------------------------------------------------------
// Broad sweep — for a maintenance script or `globalTeardown`.
// Matches the `E2E Test ...` naming convention every leaky spec uses.
// ---------------------------------------------------------------------------

/**
 * Delete every fixture row tagged with the `E2E Test ` name convention.
 * Returns a per-table count for logging. Idempotent.
 *
 * NOTE: groups / teams hard-delete CASCADEs to members + followers +
 * any registrations, so don't run this against a live host's group.
 * The `E2E Test ` prefix prevents collisions with real data — keep
 * test fixtures named accordingly.
 */
export async function sweepLeakedE2EFixtures(): Promise<{
  groups: number;
  teams: number;
  community_listings: number;
}> {
  const c = getCleanupClient();
  if (!c) return { groups: 0, teams: 0, community_listings: 0 };

  const [groupsRes, teamsRes, listingsRes] = await Promise.all([
    c.from('groups').delete().like('name', 'E2E Test Group %').select('id'),
    c.from('teams').delete().like('name', 'E2E Test Team %').select('id'),
    c.from('community_listings').delete().like('title', 'E2E Test Club %').select('id'),
  ]);

  return {
    groups: groupsRes.data?.length ?? 0,
    teams: teamsRes.data?.length ?? 0,
    community_listings: listingsRes.data?.length ?? 0,
  };
}
