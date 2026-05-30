# Live match scoring — Phase 2: `match_live_scores` table + write RPCs (2026-05-30)

## Context

Phase 2 of [ADR 0023](../adr/0023-live-match-scoring.md): the persistence + realtime
substrate for the in-progress (live) score, so a Pro host scoring a scheduled
match on the scoreboard can have the score surface live on the public
bracket/standings. Phase 1 promoted the scoring rules to the domain; this bundle
is the migration that lets that state be written cheaply and read publicly.

## Decisions

- **A separate `match_live_scores` table, not the canonical match rows.** The
  canonical bracket write (`save_bracket`) is a full delete+reinsert replace —
  pathological per rally point, and it fires winner advancement on every tap. One
  narrow upserted row per match keeps the hot path off the canonical tables; the
  live state folds into the canonical record only on finalize (Phase 3).
- **Public view reads the table (`postgres_changes`), not a broadcast channel.**
  A per-match broadcast channel keyed on `match_id` (which is in the page HTML)
  is joinable and spoofable — unacceptable for an _official_ public standings
  surface. A row only the gated RPC can write is durable **and** non-spoofable,
  and reuses the realtime plumbing the bracket page already has.
- **Writes via two SECURITY DEFINER RPCs with an explicit gate — refines the
  ADR's "INVOKER" sketch.** Chose DEFINER + explicit `is_event_host(...) OR
is_*_captain(...)` gate (the `record_bracket_match_result` shape) over INVOKER +
  table write-policies. An INVOKER RPC would still need write-policies on the new
  table, making the RPC redundant over a direct upsert; DEFINER centralizes the
  kind-branching authorization in one debuggable place that distinguishes
  not-found (P0002) from not-authorized (42501). RLS on the table is therefore
  **public SELECT + no write policy** (writes only through the DEFINER functions).
- **Denormalized `event_id` + `division_id` (FK, cascade) on the row.** Lets the
  public page subscribe with one filter (`division_id=eq.X`) instead of N
  per-match channels, and cascades cleanup when a division/event is deleted.
- **`REPLICA IDENTITY FULL`.** The public subscription filters UPDATE/DELETE
  events on `division_id` (a non-PK column); without FULL, logical replication
  only ships PK columns on UPDATE/DELETE and those filters would miss events. The
  table is tiny + hot, so FULL is cheap. (Same class of fix as
  `20260626000000_event_co_hosts_replica_identity.sql`.)
- **`clear_match_live_score` is idempotent** (no row → no-op) so the Phase 3
  finalize path can call it unconditionally; it gates on the row's _stored_
  kind/event/division.

## Changes

- `supabase/migrations/20260815000000_match_live_scores.sql` — new table
  (`match_id` PK + `kind` discriminator + denormalized `event_id`/`division_id` +
  `live_state jsonb`), public-read RLS (no write policy), `supabase_realtime` +
  `REPLICA IDENTITY FULL`, and the `upsert_match_live_score` /
  `clear_match_live_score` SECURITY DEFINER RPCs.

## Patterns observed

- The repo's authorization predicates (`is_event_host`,
  `is_event_host_for_division`, `is_bracket_match_captain`,
  `is_league_match_captain`) are all SECURITY DEFINER and read `auth.uid()`, so
  they compose cleanly inside another DEFINER RPC's gate — reuse them rather than
  re-deriving captain/host SQL.
- Public-readable tables in this repo rely on Supabase **default privileges** for
  the anon/authenticated table GRANT and only add an RLS `select using (true)`
  policy — no explicit `grant select`. Followed that convention.

## Follow-ups

- **Local apply + type regen (required before Phase 3 typechecks):**
  `pnpm db:migrate && pnpm --filter @pickupvb/supabase gen:types`. The Supabase
  CLI isn't available in the agent environment, so the migration is written/
  reviewed but **not applied here**, and `packages/supabase/src/database.types.ts`
  does not yet include `match_live_scores` / the new RPCs.
- **Phase 3:** domain `LiveMatchScoreRepository` port + application
  `UpdateLiveMatchScore` handler + Supabase adapter (calls the upsert RPC) +
  finalize mapping into the existing `RecordMatchResult` / `RecordLeagueMatchResult`
  commands.
- **Open question (gates Phase 3 finalize):** league single-number `home/away`
  mapping — sets-won vs set points.
- **Match-level orphan cleanup:** a bracket reset deletes `bracket_matches` but
  not the (polymorphic, FK-less) live row; the Phase 3 clear path should sweep
  live rows on reset/regenerate. Division/event deletion already cascades.

## Verify

TS quad still green (`typecheck && lint && test && build`) — the change is
SQL-only, so nothing TS is exercised. The migration itself was **not** applied
(no local Supabase CLI here); SQL correctness is by review against the sibling
RPC migrations, pending the local `db:migrate`.
