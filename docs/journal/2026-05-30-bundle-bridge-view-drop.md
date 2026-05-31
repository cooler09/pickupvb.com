# 2026-05-30 — Bridge-view drop (Bundle B)

The migration-only follow-up to
[2026-05-30-bundle-bridge-view-retargeting.md](2026-05-30-bundle-bridge-view-retargeting.md).
Bundle A retargeted every call site off the
`event_attendees` / `event_free_agents` SECURITY INVOKER views while
leaving the views + `INSTEAD OF` triggers in place as a behavioural
backstop. Bundle B removes that backstop now that the verify chain
has been green for a cycle.

## What changed

One migration:
[20260808000000_drop_event_attendees_free_agents_bridge.sql](../../supabase/migrations/20260808000000_drop_event_attendees_free_agents_bridge.sql).
Three blocks, in order:

1. `drop trigger if exists` for the six `INSTEAD OF
INSERT/UPDATE/DELETE` triggers (three per view). Dropping the views
   would cascade-drop these — explicit drops keep the diff honest
   about what's leaving.
2. `drop view if exists` for both bridge views.
3. `drop function if exists` for the six bridge trigger functions
   (`event_attendees_bridge_{insert,update,delete}` +
   `event_free_agents_bridge_{insert,update,delete}`). These are
   independent of the views — the view drop unbinds them from the
   trigger but the function objects survive until dropped by name.

Type-stub follow-up in
[packages/supabase/src/database.types.ts](../../packages/supabase/src/database.types.ts):
removed the `event_attendees` and `event_free_agents`
`Database['public']['Tables']` entries. The stub is hand-patched
locally (Docker off, per the `supabase-types-stub` repo memory);
production CI/CD regenerates from the live schema after the
migration applies.

No data movement — the canonical tables already held everything.
The views were a pure pass-through retained as a Bundle A backstop.

## Why migration-only

Bundle A was code-only and reversible by `git revert`. Bundle B is
the destructive half — once the views go, there's no putting them
back without a backfill. Splitting let the migration PR review on
its own merits (5 lines of SQL × 3 blocks, all `drop … if exists`)
rather than getting tangled with ~20 application-layer diffs.

The cost of the two-pass approach was that the bridge layer existed
for the gap between the two PRs. Worth it: any caller missed by
Bundle A would have surfaced as a broken view query, not a silent
schema mismatch.

## Patterns surfaced

- **"Collapse two tables behind a view" is a reusable two-pass
  shape.** Pass 1 = code-only retarget while the bridge masks the
  difference; pass 2 = drop the bridge in a migration-only PR.
  Worth pulling out as a named pattern next time we collapse a pair
  — the `event_team_entries` collapse (Step 5b) used the same
  shape ad-hoc, and the next "two tables really want to be one"
  candidate will land the same way.
- **`drop function if exists` after `drop view if exists` is not
  redundant.** PostgreSQL leaves the trigger functions resident
  when the view that bound them disappears; they become orphaned
  routines that survive across `pg_restore` cycles. Explicit drops
  keep the schema clean.
- **Hand-patching `database.types.ts` keeps Bundle B's verify
  honest.** Removing the type entries in lockstep with the SQL
  makes the typechecker the canary if any caller ever drifts back
  to a bridge-view name in a stale branch.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — 15/15
typecheck, lint at the existing 3 unrelated warnings, 50 web + 179
domain/application tests passing, 8/8 build (~40 s).

Local `pnpm db:migrate` not run — Docker is off locally per the
`supabase-types-stub` repo memory; the production migration applies
automatically on deploy via CI/CD and regenerates the types from
the live schema.

## Follow-ups

- `EventTeamRegistration.forfeitedAt` wiring (blocked on league
  host UI).
- `LeagueSchedule` RPC.
- Bracket-reader `source='roster'` filter loosening.

All three are carried unchanged from the preceding bundle — Bundle
B closes the bridge-view track entirely and doesn't open new ones.
