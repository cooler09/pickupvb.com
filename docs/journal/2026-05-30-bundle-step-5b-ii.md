# Step 5b.ii — Aggregate / boundary cleanup after team-entry collapse (2026-05-30)

## Context

Follow-up to [Step 5b](2026-05-30-bundle-step-5b.md). The thin pass kept
the aggregate-level `RegistrationSource = Captain | Host | WalkIn` enum
in place even though the DB had collapsed `captain` / `host` into a
single `ad_hoc` row, and left `attachTeamToDivision` as a
select-then-insert because PostgREST can't target the partial unique
index on `event_team_entries(division_id, team_id)`. This bundle lands
the cleanups (the third deferred item — bracket-reader treating ad-hoc
entries as first-class — is out of scope by user choice).

## Decisions

- **Collapse `RegistrationSource` to `Captain | WalkIn` (bijection).**
  The `Host` variant carried no behavioral signal at the aggregate
  level — the only check on `source` is `!== WalkIn` (e.g.
  `markPaidCash`). The host-proxy distinction is still computed
  locally in `RegisterTeamHandler` as `isHostProxy` and used to gate
  the "one team per division per captain" duplicate check, but no
  longer leaks into the source enum. Boundary translation in
  `SupabaseEventTeamRegistrationRepository` is now a true bijection
  (`captain <-> ad_hoc`, `walk_in <-> walk_in`).
- **`attach_team_to_division(p_division_id, p_team_id)` SQL RPC for
  atomic upsert.** PostgREST `onConflict` can't infer the partial
  index's `WHERE team_id IS NOT NULL AND deleted_at IS NULL` predicate,
  so a `SECURITY INVOKER` function does
  `INSERT … ON CONFLICT (...) WHERE ... DO NOTHING` in one statement.
  RLS still applies — caller must satisfy the existing
  `event_team_entries_insert` policy (captain attaching their own
  roster team). The repo collapses from three round-trips
  (select + teams lookup + insert) to one RPC call. Alternatives
  rejected:
  - _Replace partial unique with full unique + hard-delete roster
    rows_: loses soft-delete semantics on a primary collaboration
    surface; bigger blast radius than the RPC.
  - _Keep select-then-insert_: works but is two round-trips that
    aren't atomic.
- **Drop synthesized `captain_display_name` field from the loader
  projections.** The DB column still exists on `event_team_entries`
  but isn't populated by the registration repo (which writes only
  `display_name`), so the synthesized field at the loader was a
  derivation of `display_name`, not a real read. The one consumer
  (`hostRows[].captain.displayName` for walk-ins) now reads from
  `r.name` directly. Public projection loses a field that was never
  read.

## Files changed

- `packages/domain/src/events/event-team-registration.ts` — removed
  `Host` from `RegistrationSource`; doc comments tightened.
- `packages/application/src/commands/event-team-registration.handler.ts`
  — `RegisterTeamHandler` now always passes `source: Captain`
  (host-proxy still differentiated locally via `isHostProxy`).
- `packages/infrastructure/src/supabase-event-team-registration-repository.ts`
  — header comment updated; translation functions unchanged (already
  a bijection in code, now also in intent).
- `packages/infrastructure/src/supabase-event-repository.ts` —
  `attachTeamToDivision` rewritten to call the RPC.
- `apps/web/src/app/events/[id]/_loaders/load-event-detail.ts` —
  dropped `captain_display_name` field from both `AdHocRegRow` and
  `AdHocRegPublicRow` types and their projections; updated the host
  consumer at the `captainName` derivation.
- `supabase/migrations/20260801000000_attach_team_to_division_rpc.sql`
  — new RPC.
- `packages/supabase/src/database.types.ts` — hand-patched
  `attach_team_to_division` into public `Functions` (Docker-off
  convention per repo memory).

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green.
189 domain + 17 application + 50 web tests passing.

## Follow-ups deferred

- **Bracket reader treats ad-hoc entries as first-class.** Currently
  the bracket UI still filters to `source = 'roster'` entries; ad-hoc
  / walk-in teams in a tournament division don't appear in the
  bracket reader. Out of scope by user choice this bundle; pick up
  next time the bracket UX is touched.
- **Drop the unused `captain_display_name` DB column** from
  `event_team_entries`. The column is no longer written by any
  adapter and no longer read by the loader, but a migration to drop
  it would also need to drop the check constraint and possibly the
  RLS predicate. Defer to a schema-cleanup pass.
- **Drop the unused `isHostProxy` audit-only branch.** With `source`
  no longer carrying the proxy bit, `isHostProxy` only affects the
  duplicate-check skip. If we keep an audit `created_by` column the
  proxy fact can be reconstructed at write time without the local
  variable; consider folding into a single "host walk-in via captain
  account" code path.
