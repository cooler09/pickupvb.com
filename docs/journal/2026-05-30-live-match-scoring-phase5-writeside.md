# Live match scoring — Phase 5 (write side): live persistence adapter + per-point push (2026-05-30)

## Context

Completes the deferred Phase 3 adapter and wires the **write half** of the
live-during-play feature (ADR 0023): as a Pro host scores a bound match on the
scoreboard, the in-progress score is now persisted (debounced) to
`match_live_scores` via the authorization-gated RPC, and cleared when the result
is finalized. The **read half** — the public bracket/standings rendering the live
score in place — is the remaining Phase 5 item.

The Supabase CLI is present in the environment now, but the Docker daemon is not
running, so the Phase 2 migration could not be applied locally and `gen:types`
could not run. To unblock the adapter, the `match_live_scores` table + the
`upsert_match_live_score` / `clear_match_live_score` function signatures were
**hand-added** to `packages/supabase/src/database.types.ts` matching the
generator's format. **This must be reconciled by a real `gen:types`** once Docker
is up — see Follow-ups.

## Decisions

- **Hand-added the generated DB types rather than spinning up Docker/Supabase
  unprompted.** Object types are order-independent, so the entries were inserted
  at convenient anchors (table before `league_schedule_matches`, functions after
  `record_bracket_match_result`); a later `gen:types` will reorder/normalize but
  the shapes match, so the adapter keeps typechecking across the regen.
- **Adapter mirrors `SupabaseLeagueScheduleRepository`'s captain path** — optional
  client, lazy admin fallback, RPC args cast `as never`, `42501 → UnauthorizedError`
  / `P0002 → NotFoundError`. Writes run through the **user-scoped** client
  (wired in `getMatchResultHandlers`) so the RPC's host-or-captain gate is
  enforced (AGENTS.md pitfall #8).
- **Per-point push is best-effort and NOT Pro-re-checked.** `pushLiveScore` uses
  `getViewer` (not `requireRealUser` — it must never redirect a fire-and-forget
  tick) and swallows errors. The host-level Pro gate stays on the entry button +
  finalize; re-checking `isPro` on every debounced tick would add a query/point
  for no real protection (the RPC already enforces host/captain). Documented so
  the read side (Phase 5) gates the public _render_ on the host being Pro.
- **Debounced ~800ms in the scoreboard** via a `setTimeout` + cleanup effect keyed
  on `state` — each tap resets the timer, so we persist after the last change,
  not every point. Guarded by `binding` so the free tool never pushes.
- **Clear-on-finalize is best-effort** (wrapped in its own try/catch after the
  canonical record lands): a stale live row is harmless and the `clear` RPC is
  idempotent.

## Changes

- `packages/supabase/src/database.types.ts` — **hand-added** `match_live_scores`
  table + `upsert_match_live_score` / `clear_match_live_score` functions
  (pending `gen:types` reconciliation).
- `packages/infrastructure/src/supabase-live-match-score-repository.ts` — new
  `SupabaseLiveMatchScoreRepository` (upsert / clear / findByMatchId); exported
  from the infra barrel.
- `apps/web/src/lib/handlers.ts` — `getMatchResultHandlers()` now also returns
  user-scoped `upsertLiveMatchScore` / `clearLiveMatchScore` handlers.
- `apps/web/src/app/tools/scoreboard/[code]/finalize-actions.ts` — `pushLiveScore`
  (debounced per-point write) + clear-the-live-row after a successful finalize.
- `.../[code]/_components/scoreboard-view.tsx` — debounced `pushLiveScore` effect
  when `binding` is present.

## Follow-ups

- **Confirm the hand-added types:** with Docker up, run `pnpm db:migrate && pnpm
--filter @pickupvb/supabase gen:types` and diff `database.types.ts`. Expect only
  cosmetic reordering; if the FK constraint names differ from the guessed
  `match_live_scores_{division_id,event_id}_fkey`, the Relationships block will
  change (harmless — the adapter doesn't use it).
- **Phase 5 read side (the visible piece):** a division-scoped `match_live_scores`
  `postgres_changes` subscriber + in-place live score + "LIVE" badge on the
  public bracket spectator view, host bracket page, and league schedule. Gate the
  public render on the host being Pro (closes the theoretical "non-Pro host crafts
  pushLiveScore calls" leak noted above).
- **Match-level orphan sweep:** clearing live rows on bracket reset/regenerate
  (division/event deletion already cascades).

## Verify

Full quad green (`typecheck && lint && test && build`): lint 0 errors / 3
pre-existing warnings; domain 364 / application 56 / infrastructure 41 / web 79
tests pass; build OK. The live-persist path is typecheck/build-verified but not
runtime-exercised (no local Supabase); end-to-end confirmation waits on the
migration apply + a deployed environment.
