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

/**
 * Resolve a test account's auth user id by email via the GoTrue admin API.
 * Shared by the admin-client fixtures (league, scoped-event) that need to set a
 * persona as `events.host_id` / a `friendships` endpoint. The dev project has a
 * small, stable user set, so paging a couple hundred at a time finds the
 * address on the first page. Throws (loudly) when the account is missing — the
 * seed-fixture precondition (sign in once as each test account to provision
 * `auth.users` + `profiles`) applies here too. Requires the admin client; throws
 * when cleanup isn't configured.
 */
export async function resolveUserIdByEmail(email: string): Promise<string> {
  const admin = getCleanupClient();
  if (!admin) {
    throw new Error(
      'resolveUserIdByEmail: admin client unavailable — set E2E_CLEANUP_SUPABASE_URL / _SECRET_KEY.',
    );
  }
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`resolveUserIdByEmail: listUsers failed — ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  throw new Error(
    `resolveUserIdByEmail: no auth user for ${email}. Sign in once as that account to provision auth.users + profiles, then retry.`,
  );
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

/**
 * Hard-delete a standalone bracket (ADR 0025) by id. Unlike event brackets,
 * standalone brackets have **no UI delete path** — the workspace only offers
 * share / watch links — so spec cleanup must go through the admin client.
 * CASCADE off `event_brackets` clears `bracket_teams`, `bracket_seeds`,
 * `bracket_matches`, and their set rows (see migration
 * 20260821000000_standalone_brackets.sql). Safe when cleanup is disabled
 * (no-op) and when the row is already gone (silent).
 */
export async function deleteBracketById(id: string): Promise<void> {
  const c = getCleanupClient();
  if (!c) return;
  await c.from('event_brackets').delete().eq('id', id);
}

// ---------------------------------------------------------------------------
// Broad sweep — for a maintenance script or `globalTeardown`.
// Matches the `E2E ` naming convention every leaky spec + fixture uses.
// ---------------------------------------------------------------------------

const SWEEP_CHUNK = 100;

function sweepChunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += SWEEP_CHUNK) out.push(items.slice(i, i + SWEEP_CHUNK));
  return out;
}

/**
 * Delete every fixture row tagged with the `E2E ` name convention — events,
 * groups, teams, community listings. Returns a per-table count for logging.
 * Idempotent.
 *
 * Pass `{ olderThanHours: N }` to **only** reclaim fixtures whose `created_at`
 * is more than N hours old. This is the concurrency guard for `globalTeardown`:
 * a second run executing against the same environment always has fixtures
 * younger than the window, so the teardown of one run can't clobber another's
 * in-flight rows. Omit the option (the maintenance-script case) to sweep every
 * matching fixture regardless of age.
 *
 * Order matters: events go first so their CASCADE (divisions → entries →
 * brackets → payments) clears the `event_team_entries` rows that would
 * otherwise FK-block the team deletes. Any team still referenced afterwards
 * belongs to a surviving fixture — the persistent bracketed `[E2E] …` seed
 * tournaments — and is intentionally kept. The `E2E ` prefix (note the
 * trailing space) does NOT match `[E2E] …`, so the seed events are never swept.
 *
 * Deletes are chunked and drained page-by-page: a single bulk delete of
 * hundreds of events times out under PostgREST because each one CASCADEs
 * across half a dozen child tables. This is why the suite's old sweep (which
 * only covered groups/teams/listings and never events) let 700+ events
 * accumulate on dev — see docs/audits/data-lifecycle.md P2 #4.
 *
 * NOTE: groups / teams hard-delete CASCADEs to members + followers + any
 * registrations, so don't run this against a live host's group. The `E2E `
 * prefix prevents collisions with real data — keep test fixtures named
 * accordingly, and conversely **never name a persisted seed entity `E2E …`**
 * or this sweep will reclaim it.
 */
export async function sweepLeakedE2EFixtures(opts?: { olderThanHours?: number }): Promise<{
  events: number;
  groups: number;
  teams: number;
  community_listings: number;
}> {
  const c = getCleanupClient();
  if (!c) return { events: 0, groups: 0, teams: 0, community_listings: 0 };

  // Age guard (see docstring): when set, only rows created before this cutoff
  // are eligible, so a concurrent run's fresh fixtures are never swept.
  const cutoff =
    opts?.olderThanHours != null
      ? new Date(Date.now() - opts.olderThanHours * 60 * 60 * 1000).toISOString()
      : null;

  // 1) Events first — CASCADE frees the event_team_entries that FK-block teams.
  let events = 0;
  for (;;) {
    const base = c.from('events').select('id').ilike('title', 'E2E %');
    const { data } = await (cutoff ? base.lt('created_at', cutoff) : base).limit(500);
    const ids = (data ?? []).map((r) => r.id);
    if (ids.length === 0) break;
    let progressed = 0;
    for (const batch of sweepChunks(ids)) {
      const { error } = await c.from('events').delete().in('id', batch);
      if (!error) progressed += batch.length;
    }
    events += progressed;
    if (progressed === 0) break; // unexpected FK — avoid an infinite re-fetch loop.
  }

  // 2) Groups — CASCADE clears members + followers.
  let groups = 0;
  for (;;) {
    const base = c.from('groups').select('id').ilike('name', 'E2E %');
    const { data } = await (cutoff ? base.lt('created_at', cutoff) : base).limit(500);
    const ids = (data ?? []).map((r) => r.id);
    if (ids.length === 0) break;
    let progressed = 0;
    for (const batch of sweepChunks(ids)) {
      const { error } = await c.from('groups').delete().in('id', batch);
      if (!error) progressed += batch.length;
    }
    groups += progressed;
    if (progressed === 0) break;
  }

  // 3) Teams — named `E2E …` (UI fixtures) or slugged `e2e-…` (admin-client
  //    league/bracket fixtures). Skip any still referenced by a surviving
  //    event (the `[E2E] …` seed); drop members first, then delete.
  const teamIds = new Set<string>();
  for (const [col, pat] of [
    ['name', 'E2E %'],
    ['slug', 'e2e-%'],
  ] as const) {
    for (let from = 0; ; from += 1000) {
      const base = c.from('teams').select('id').ilike(col, pat);
      const { data } = await (cutoff ? base.lt('created_at', cutoff) : base).range(
        from,
        from + 999,
      );
      const rows = data ?? [];
      for (const r of rows) teamIds.add(r.id);
      if (rows.length < 1000) break;
    }
  }
  const referenced = new Set<string>();
  for (const batch of sweepChunks([...teamIds])) {
    const { data } = await c.from('event_team_entries').select('team_id').in('team_id', batch);
    for (const r of data ?? []) if (r.team_id) referenced.add(r.team_id);
  }
  const orphanTeamIds = [...teamIds].filter((id) => !referenced.has(id));
  let teams = 0;
  for (const batch of sweepChunks(orphanTeamIds)) {
    await c.from('team_members').delete().in('team_id', batch);
    const { error } = await c.from('teams').delete().in('id', batch);
    if (!error) {
      teams += batch.length;
    } else {
      // An unexpected FK on a single row shouldn't sink the whole batch.
      for (const id of batch) {
        const { error: rowErr } = await c.from('teams').delete().eq('id', id);
        if (!rowErr) teams += 1;
      }
    }
  }

  // 4) Community listings.
  let community_listings = 0;
  for (;;) {
    const base = c.from('community_listings').select('id').ilike('title', 'E2E %');
    const { data } = await (cutoff ? base.lt('created_at', cutoff) : base).limit(500);
    const ids = (data ?? []).map((r) => r.id);
    if (ids.length === 0) break;
    let progressed = 0;
    for (const batch of sweepChunks(ids)) {
      const { error } = await c.from('community_listings').delete().in('id', batch);
      if (!error) progressed += batch.length;
    }
    community_listings += progressed;
    if (progressed === 0) break;
  }

  return { events, groups, teams, community_listings };
}
