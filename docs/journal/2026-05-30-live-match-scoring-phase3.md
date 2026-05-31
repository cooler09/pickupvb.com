# Live match scoring — Phase 3 (pure parts): port, commands, finalize mapping (2026-05-30)

## Context

Phase 3 of [ADR 0023](../adr/0023-live-match-scoring.md): the application/domain
glue between the `LiveMatchScore` VO (Phase 1) and the `match_live_scores`
persistence (Phase 2). This bundle ships the **layer-pure, fully-verifiable**
parts — the repository port, the upsert/clear command handlers, and the finalize
mapping — and defers only the Supabase adapter + composition wiring, which need
the regenerated DB types (the Supabase CLI is unavailable in the agent
environment, so `db:migrate` + `gen:types` is a user step).

The league single-number mapping question that gated this phase was **resolved:
adaptive** (best-of-1 → set points; multi-set → sets won) — recorded in the ADR.

## Decisions

- **Repository port keyed by plain `string` match id + a `MatchKind` union**
  (`'bracket' | 'league'`), not branded ids — the port is polymorphic over both
  match tables, mirroring the `match_live_scores.kind` discriminator. Authorization
  stays at the persistence boundary (the RPCs), so the port doc mandates a
  user-scoped client (AGENTS.md pitfall #8).
- **Thin upsert/clear command handlers, kept despite carrying no rules.** The VO
  enforces the scoring rules and the RPC enforces auth, so the handlers are
  pass-throughs — but I kept them (over a pro.ts-style facade, pitfall #10)
  because this is a genuine CQRS _write_ with a state payload, and a fake-repo
  unit test is the cheap seam that pins "the kind reaches the port." Named
  `Upsert…` (not the ADR's sketch `Update…`) to match the RPC semantics.
- **Finalize mapping lives in `application`, not `domain/scoring`.** It bridges
  `LiveMatchScore` → bracket `MatchSet[]` / league pair, which would couple
  `domain/scoring` to `domain/brackets`. Keeping the VO a standalone generic
  rally-score type and placing the finalize _policy_ (incl. the adaptive league
  rule) in the application layer matches the `event-analytics-mapper` precedent.
- **`liveMatchScoreToMatchSets` appends the current set only when it has points.**
  Covers both "save after the deciding `commitSet`" (current 0–0, dropped) and
  "save mid-set" (host saves before committing the last set).
- **Side A = home, side B = away** is fixed by construction (the Phase 4 scorer
  surface seeds the board with side A = the home/first team).

## Changes

- `packages/domain/src/scoring/live-match-score-repository.ts` —
  `LiveMatchScoreRepository` port + `MatchKind`. Exported from `scoring/index.ts`.
- `packages/application/src/commands/live-match-score.handler.ts` —
  `UpsertLiveMatchScoreCommand`/Handler + `ClearLiveMatchScoreCommand`/Handler.
- `packages/application/src/scoring/live-match-finalize.ts` —
  `liveMatchScoreToMatchSets` + `liveMatchScoreToLeagueScore` (adaptive).
- Tests: `live-match-finalize.test.ts` (7), `live-match-score.handler.test.ts` (2,
  fake repo).
- `packages/application/src/index.ts` — barrel exports.
- `docs/adr/0023-live-match-scoring.md` — league-mapping open question marked
  RESOLVED (adaptive).

## Follow-ups

- **Deferred to a follow-up (needs `gen:types`):** `SupabaseLiveMatchScoreRepository`
  adapter (calls `upsert_match_live_score` / `clear_match_live_score` RPCs +
  selects `match_live_scores` on a user-scoped client) and the composition wiring
  in [handlers.ts](../../apps/web/src/lib/handlers.ts). Blocked only on the local
  `pnpm db:migrate && pnpm --filter @pickupvb/supabase gen:types`.
- **Phase 4:** the auth'd scorer route + Pro-gated "Score live" buttons.
- **Phase 5:** the in-place public live view.

## Verify

Full quad green (`typecheck && lint && test && build`). New tests:
`live-match-finalize` (7), `live-match-score.handler` (2). Application suite 56
pass, domain 364 pass.
