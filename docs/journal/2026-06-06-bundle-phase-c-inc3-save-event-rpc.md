# Phase C inc. 3 — atomic `save_event` RPC (2026-06-06, deploy-gated)

## Context

The last piece of P2-2 (and the carried-over 2026-05-29 deferral): the
multi-statement `SupabaseEventRepository.save()` was non-atomic — events upsert +
five child reconciles, each its own implicit transaction, so a transient failure
mid-sequence could half-write an event. The audit's fix: "wrap the multi-statement
write in a SECURITY DEFINER RPC (or single transaction) for atomicity." See
[architecture.md § Reevaluation — 2026-06-06](../audits/architecture.md#reevaluation--2026-06-06).

## Decisions

- **Scope = full `save_event` (true whole-save atomicity), per the user's call.**
  Investigation ruled out a `save_bracket`-style clear-and-reinsert: the event
  children carry order/history (`event_participants.joined_at`,
  `event_waitlist.created_at` FIFO, `event_team_entries.registered_at` +
  soft-deletes, `event_divisions` placements) that a naive replace would destroy.
  So the RPC reimplements the **delta** logic faithfully. The alternative
  (a "dumb apply" RPC fed TS-computed ops) was considered to keep the unverifiable
  SQL trivial, but the user chose the full RPC for true single-transaction
  atomicity (events + all children).
- **The PL/pgSQL is a line-by-line translation of the inc.1 TS reconcilers, and
  the characterization test is its executable spec.** Same delta semantics
  (insert-only-new / delete-only-removed / update-only-changed), same
  division-id scoping + sole-division fallback (ADR 0019), same
  `attach_team_to_division` captain/name resolution + partial-index
  `ON CONFLICT DO NOTHING`, same free-agent idempotent insert (the former 23505
  swallow → `ON CONFLICT DO NOTHING` on the partial `(division_id, user_id)`
  index). `event-save-children.ts` is **deleted** — its logic now lives in the RPC
  (`divisionToRow` moved back into the adapter). The inc.1 extraction wasn't
  wasted: its reconcilers + char test were the precise spec this SQL mirrors.
- **`SECURITY INVOKER`** (matches `save_bracket`/`save_league_schedule`): the
  adapter calls it on the service-role admin client (RLS bypassed anyway), but the
  INVOKER posture keeps RLS in force for any future user-scoped caller.
- **`short_code` omitted from the INSERT** — the `events_assign_short_code` BEFORE
  INSERT trigger fills it (and doesn't fire on the ON CONFLICT UPDATE path).
  Events columns not in `save()`'s payload (host_group_id, host_absorbs_fee,
  pass_processing_fee_to_buyer, refund_window_hours, hero_image_url) are
  deliberately untouched — owned by other write paths.
- **Generated types hand-edited** (added the `save_event` Function) per AGENTS.md —
  will be regenerated on the next real `gen:types`.

## Changes

- New [supabase/migrations/20260919000000_save_event_rpc.sql](../../supabase/migrations/20260919000000_save_event_rpc.sql)
  — `save_event(p_event, p_attendees, p_waitlist, p_teams, p_free_agents, p_divisions)`.
- [supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts):
  `save()` now builds the six JSONB payloads + one `rpc('save_event', …)`;
  `divisionToRow` moved back in; dropped the `TablesInsert` import + the
  `event-save-children` import.
- **Deleted** `packages/infrastructure/src/event-save-children.ts`.
- [database.types.ts](../../packages/supabase/src/database.types.ts): `save_event`
  Function entry.
- [supabase-event-repository.test.ts](../../packages/infrastructure/src/supabase-event-repository.test.ts):
  save() char test rewritten — asserts exactly one `save_event` RPC carrying the
  full desired-state payload (getDetail read-sequence tests unchanged).

## Verify

- **TS quad green**: typecheck 15/15; lint 0 errors; test (domain 547 / application
  145 / infra 53 / web 262); build 8/8.
- Pre-write SQL sanity: `events.geo` is `geography(point,4326)` (the `::geography`
  cast is correct); all 12 enum type names (`surface`, `event_type`, `visibility`,
  `event_status`, `registration_mode`, `format`, `gender`, `skill_tier`,
  `age_group`, `team_composition`, `team_registration_mode`, `price_unit`) exist.

## Risks

- **⚠️ The migration cannot be verified locally** (no Docker / local Supabase) and
  it sits on the **hottest write path** — every event create / edit / signup /
  team registration / free-agent / waitlist / division edit goes through `save()`.
  A subtle PL/pgSQL bug (a type coercion, a delta-set edge) would surface only on
  deploy. **Do not merge until dev e2e exercises all of those flows on
  dev.pickupvb.com.** Rollback story: revert the `save()` cutover commit (restore
  the per-statement TS path / `event-save-children.ts` from git) — the RPC can be
  left in place unused.

## Follow-ups

- Run the event-write e2e journeys against dev before merge (the gating step).
- Remaining architecture backlog: **P3-1** (page-diet regressions) and **P3-2**
  (761-LOC `messages.ts` per-subdomain split) — both low-risk, no DB.
