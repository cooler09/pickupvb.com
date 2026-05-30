# Live match scoring — Phase 4: score on the scoreboard → save to the match (2026-05-30)

## Context

Phase 4 of [ADR 0023](../adr/0023-live-match-scoring.md). Delivers the headline
user-requested capability end-to-end: a Pro host launches the live scoreboard
pre-seeded for a scheduled match, scores it, and saves the result back to the
official bracket/league record — alongside the existing manual entry.

**What this phase does NOT include** (deferred, blocked on local `gen:types`): the
per-point persistence to `match_live_scores` and the in-place public live view
(the "live-during-play" half of ADR 0023). Those need the `SupabaseLiveMatchScoreRepository`
adapter, which can't typecheck until the Phase 2 migration is applied and
`packages/supabase/src/database.types.ts` is regenerated (the Supabase CLI is
unavailable in the agent environment). This phase is the **save-on-complete**
slice, which needs no new adapter — it reuses the existing finalize handlers.

## Decisions

- **Reused the existing free scoreboard route (`/tools/scoreboard/{code}`) with
  optional binding params — refines the ADR's dedicated `/events/[id]/score/[matchId]`
  sketch.** Launching with `?event&division&match&kind&ret` lets the page build a
  `MatchBinding` and surface a "Save final to match" bar; absent, the free tool is
  byte-for-byte unchanged. This reuses code generation, the realtime sync hook,
  localStorage, and the remote link with zero duplication, vs. standing up a
  parallel route + match loaders. The Pro gate is the entry button's visibility
  plus a server-side re-check in the finalize action (not a route guard).
- **Finalize reuses the existing `getMatchResultHandlers()` + the Phase 3 mapping
  helpers — no new adapter.** `finalizeMatchFromScoreboard` maps the terminal
  `LiveMatchScore` → `RecordMatchResultCommand` (bracket) / `RecordLeagueMatchResultCommand`
  (league) and runs the unchanged, RLS-gated handlers. This is why the headline
  feature ships without the blocked `match_live_scores` adapter — winner
  advancement + standings come for free from the canonical path.
- **Client-invoked action returns a typed `FinalizeResult`, not a redirect**
  (AGENTS.md server-action error handling for client-component callers). `requireRealUser`
  may still redirect at the auth boundary — acceptable.
- **Pro gate computed in the host pages via `isPro(event.hostUserId)`** (the read
  model's host user id; `React.cache`-memoized, pitfall #10-compliant direct
  facade read), threaded down as `liveScoringEnabled`. The button additionally
  requires the existing host/captain `canEdit` (bracket) / `isHost` (league), and
  the action re-checks Pro server-side.
- **`exactOptionalPropertyTypes`:** pass-through props coerced `?? false` rather
  than forwarding `boolean | undefined` into an optional prop (the documented trap).

## Changes

- `apps/web/src/app/tools/scoreboard/_lib/binding.ts` — `MatchBinding` type.
- `apps/web/src/app/tools/scoreboard/[code]/finalize-actions.ts` — `finalizeMatchFromScoreboard`
  (Pro re-check → map → existing handler → revalidate) + `FinalizeResult`.
- `apps/web/src/app/tools/scoreboard/[code]/page.tsx` — parse optional binding params.
- `.../[code]/_components/scoreboard-view.tsx` — optional `binding` prop + `SaveToMatchBar`.
- `apps/web/src/app/events/[id]/_components/score-live-button.tsx` — shared Pro entry
  launcher (generates room code in the click handler, navigates with binding params).
- Bracket: `match-card.tsx`, `board-view.tsx` (+ `PoolsView`), `bracket/page.tsx`
  — `liveScoringEnabled` threaded from `isPro(hostUserId)` to the button.
- League: `schedule/_components/match-row.tsx`, `schedule/page.tsx` — same.

## Follow-ups

- **Unblock the live-during-play half:** run `pnpm db:migrate && pnpm --filter
@pickupvb/supabase gen:types`, then build `SupabaseLiveMatchScoreRepository` +
  wire `UpsertLiveMatchScore`/`ClearLiveMatchScore` in handlers.ts, have
  `SaveToMatchBar`/the scoreboard upsert per point, and add the in-place public
  live view (Phase 5).
- **League best-of:** the entry button hard-codes `bestOf=1` (single game) for
  league matches since the schedule stores no format. Revisit if leagues want
  multi-set matches (would need a per-match/division format setting).
- **Remote link on bound boards:** the free tool's `/s/{code}` remote still works
  (the binding rides separate params), so no change needed.

## Verify

Full quad green (`typecheck && lint && test && build`): lint 0 errors / 3
pre-existing warnings; domain 364, application 56, web 79 tests pass; build OK
(scoreboard + bracket + schedule routes compiled). End-to-end live-persist isn't
exercised here (that's the deferred half); the finalize path reuses the
already-tested canonical handlers.
