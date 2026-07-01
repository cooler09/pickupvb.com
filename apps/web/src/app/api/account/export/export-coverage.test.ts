import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * GDPR export drift guard (privacy audit #20).
 *
 * The data-export endpoint has fallen behind the schema three times — chat (#15),
 * media/badges/waitlist (#18), and the passes/memberships/waiver bundle (#20) all
 * shipped user-data tables the export missed. This test makes the schema itself
 * the forcing function: it scans the generated types for every `public` BASE table
 * carrying a per-user column (`user_id` / `*_user_id`) and asserts each is either
 *   - read by the export route ([route.ts] `.from('…')`), or
 *   - explicitly EXEMPT (never belongs in a personal export), or
 *   - explicitly BACKLOG (a known, acknowledged gap to revisit).
 *
 * When the next migration adds a per-user table, it lands in none of the three and
 * this test fails until someone makes a portability decision. EXPORTED is derived
 * from route.ts (not hand-listed) so adding a `.from('new_table')` there is all it
 * takes to clear the guard.
 */

const here = dirname(fileURLToPath(import.meta.url));
const typesPath = join(here, '../../../../../../../packages/supabase/src/database.types.ts');
const routePath = join(here, 'route.ts');

/** Base tables in `public` whose Row has a `user_id` / `*_user_id` column. */
function userDataTables(): Set<string> {
  const src = readFileSync(typesPath, 'utf8');
  const schemaStart = src.indexOf('\n  public: {');
  const tablesStart = src.indexOf('\n    Tables: {', schemaStart);
  const viewsStart = src.indexOf('\n    Views: {', tablesStart);
  const block = src.slice(tablesStart, viewsStart);

  const found = new Set<string>();
  let current: string | null = null;
  for (const line of block.split('\n')) {
    const header = /^      ([a-z_]+): \{$/.exec(line);
    if (header) {
      current = header[1]!;
      continue;
    }
    if (current && /^ +(?:[a-z_]*_user_id|user_id): /.test(line)) {
      found.add(current);
    }
  }
  return found;
}

/** Tables the export route reads, parsed from its `.from('…')` calls. */
function exportedTables(): Set<string> {
  const src = readFileSync(routePath, 'utf8');
  return new Set([...src.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]!));
}

// Per-user tables that must NEVER appear in a personal data export.
const EXEMPT = new Map<string, string>([
  ['audit_log', 'service-role security trail; actor/target SET NULL on deletion'],
  ['deletion_requests', 'the erasure ledger itself; surfaced on /profile/account/delete'],
  ['notification_outbox', 'transient delivery records; the durable feed is `notifications`'],
  ['marketing_attribution', 'analytics attribution row, not user-authored content'],
]);

// Per-user tables knowingly not yet exported — acknowledged follow-ups, not
// failures. Promote one to the export (add a `.from()` in route.ts) to clear it.
const BACKLOG = new Map<string, string>([
  ['event_badge_access', 'host badge-slot purchase (Stripe mirror, buyer SET NULL)'],
  ['event_sponsor_access', 'host sponsor-slot purchase (Stripe mirror, buyer SET NULL)'],
  ['event_brackets', 'host tournament-tooling state, reconstructable'],
  ['event_co_hosts', 'co-host association rows, not user-authored content'],
  ['group_followers', 'groups the user follows — low-value association'],
  ['group_members', 'group memberships — association, revisit on request'],
  ['team_members', 'team memberships — association, revisit on request'],
  ['host_event_templates', "host's saved event-form templates — convenience data"],
  ['host_stripe_accounts', 'Connect account status flags; the account lives on Stripe'],
  // host_subscriptions has NO owner SELECT policy (Pro status is read via the
  // is_pro_host SECURITY DEFINER fn, not a table read), so a user-scoped export
  // read returns []. Exporting it would need an admin read or a new RLS policy —
  // unlike host_memberships, which has a member SELECT policy and IS exported.
  ['host_subscriptions', 'no owner SELECT policy — would need admin read or new RLS'],
  // poll_responses.user_id is set only when a signed-in user answers a public
  // poll (usually null — responders are sessionless). RLS is creator-only SELECT
  // (is_poll_creator), so a respondent-scoped export read returns [] without a
  // new self-SELECT policy — same shape as host_subscriptions (ADR 0041).
  [
    'poll_responses',
    'sessionless poll answers; user_id often null, creator-only RLS blocks self-read',
  ],
]);

describe('GDPR export coverage', () => {
  const detected = userDataTables();
  const exported = exportedTables();

  it('classifies every per-user table as exported, exempt, or backlogged', () => {
    const unclassified = [...detected].filter(
      (t) => !exported.has(t) && !EXEMPT.has(t) && !BACKLOG.has(t),
    );
    // A new per-user table landed without a portability decision. Either read it
    // in route.ts, or add it to EXEMPT / BACKLOG above with a one-line reason.
    expect(unclassified).toEqual([]);
  });

  it('keeps EXEMPT / BACKLOG free of stale or double-listed tables', () => {
    for (const t of [...EXEMPT.keys(), ...BACKLOG.keys()]) {
      // Renamed/dropped, or now exported — drop the stale entry.
      expect(detected.has(t), `${t} no longer has a per-user column`).toBe(true);
      expect(exported.has(t), `${t} is now exported; remove from EXEMPT/BACKLOG`).toBe(false);
    }
    for (const t of EXEMPT.keys()) expect(BACKLOG.has(t)).toBe(false);
  });

  it('confirms the #20 monetization/waiver tables are now exported', () => {
    for (const t of [
      'pass_purchases',
      'host_memberships',
      'waiver_signatures',
      'referrals',
      'pro_grants',
      'host_passes',
      'host_membership_plans',
    ]) {
      expect(exported.has(t), `${t} missing from the export`).toBe(true);
    }
  });
});
