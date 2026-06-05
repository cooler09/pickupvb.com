# Bracket workflow redesign — domain foundation (2026-06-02)

## Context

User request: "the bracket creator doesn't really align with real-world
scenarios — reevaluate and change the whole workflow." Two driving scenarios:
a **serious** tournament (pool round-robin → cross-seeded playoff) and a **rec**
tournament (uneven pools where everyone gets ~equal play, **even if they replay
a team**, with flexible best-of / point totals). Across both, the host must be
able to **manually override anything** — seeding, team↔pool assignment, the
pool schedule, match data, the playoff bracket.

The pre-existing model ([bracket.ts](../../packages/domain/src/brackets/bracket.ts),
[generators.ts](../../packages/domain/src/brackets/generators.ts)) treated a
generated graph as **frozen**: even-only snake pools, `fixed_games` forbade
repeat opponents (`gamesPerTeam < poolSize`), one bracket-wide `bestOf`,
auto-only position-based playoff, and editing locked once any match started.

Design + decisions captured in [ADR 0032](../adr/0032-bracket-workflow-redesign.md)
(extends [ADR 0018](../adr/0018-pool-play-configuration.md)). Four product
choices were confirmed with the user up front: **hybrid draft→live lifecycle**,
**auto target-games + manual** scheduling, **per-stage + per-match** match
length with a new target-score field, and **auto cross-seed + manual** playoff.

This bundle is **Phase 0 + 1** of a phased plan: the schema migration and the
pure domain (aggregate, generators, standings) + tests. The application/UI
phases (draft workspace, live-board inline edits, e2e) are deferred — see
Follow-ups.

## Decisions

- **Added a `draft` `BracketStatus`** (`setup → draft → active → completed`),
  reversing ADR 0018's explicit rejection of it. With _full_ draft-stage editing
  (not just reorder), the dozens of "editable structure vs. live scoring?"
  checks read clearer as a status than `setup && matches.length > 0`.
- **Relaxed `fixed_games` to mean "~N games per team, repeats allowed"** rather
  than adding a third `poolSchedule` mode. `target_games` would have been a
  strict superset; existing stored configs (`gamesPerTeam < poolSize`) behave
  identically (no repeats needed), so relaxing in place beats new surface.
- **`generateRoundRobin` gained `allowRepeats`** (default false) instead of
  changing its capping default — preserves the existing "cap at full RR" test
  and the round_robin path; only the target-games caller opts in.
- **`roundsForTargetGames(poolSize, target)`** compensates for the bye in odd
  pools (`ceil(target·p/(p−1))`) so a 3-team and 4-team pool both reach the
  target; rounding up errs toward _more_ play (the rec goal).
- **Cross-seed = position tier, then record within tier** (`rankAcrossPools`),
  not pure overall record. Keeps pool winners as the top seeds (top two on
  opposite halves, fewer same-pool round-1 rematches) while still ranking the
  strongest winner #1. Win _rate_ (not raw wins) handles uneven pools.
- **Generate handlers temporarily `publish()` after `generate()`** so the live
  one-click flow still lands `active` until the draft workspace (Phase 4) ships.
  Chose a clearly-commented bridge over leaving the app rendering a blank
  `draft`. Drop it when the Publish button lands.
- **Pulled the infra repo mapping forward** (normally Phase 2): adding required
  `Match.bestOf`/`targetScore` forces the repo's `Match` construction to map
  them or full `typecheck` breaks. The repo already casts rows `as unknown`, so
  the new columns are read without regenerated `database.types.ts`.

## Changes

- **Migration** [20260908000000_bracket_manual_edit.sql](../../supabase/migrations/20260908000000_bracket_manual_edit.sql)
  — widen `event_brackets` status CHECK to include `draft` (drop by both
  possible constraint names; rename never touched it); add nullable
  `bracket_matches.best_of` / `target_score`; update `save_bracket` RPC to
  round-trip them.
- **enums.ts** — `BracketStatus` gains `draft`.
- **match.ts** — `Match` gains nullable `bestOf` / `targetScore`.
- **generators.ts** — `generateRoundRobin(allowRepeats)`; `generatePoolPlay`
  honors host-assigned (uneven) pools via `poolsFromSeedsOrSnake` and
  target-games-with-repeats; new `roundsForTargetGames`; replaced
  `generatePlayoffFromStandings` with `generatePlayoffFromRanked` (flat ranked
  list, reused by auto + manual seeding); all `Match` literals carry the two
  new fields.
- **standings.ts** — new `rankAcrossPools` (cross-pool overall seed order).
- **bracket.ts** — config gains `targetScore` / `playoffBestOf` /
  `playoffTargetScore` (validated); `generate()` lands in `draft` and may
  re-run from `draft`; new `publish()` / `reopen()`; new manual mutators
  `setPools` / `editMatch` / `addMatch` / `removeMatch` / `replaceEntry` /
  `seedPlayoff`; `reorderPoolMatches` allowed in `draft`; `recordResult` uses
  `effectiveBestOf` (per-match → stage → global).
- **bracket-events.ts** — `BracketPublished` / `BracketReopened`.
- **bracket.handler.ts / standalone-bracket.handler.ts** — generate handlers
  bridge with `publish()` (see Decisions).
- **supabase-bracket-repository.ts** — `MatchRow` + hydrate + save map
  `best_of` / `target_score`.
- **Tests** — `bracket.test.ts` (+ updated standalone-lifecycle and reorder
  tests for the draft stage; new suites for lifecycle, per-stage/per-match
  best-of, manual edits, uneven-pool target-games, cross-seed); `standings.test.ts`
  - `bracket.handler.test.ts` match factories carry the new fields.

## Patterns observed

- **Adding a required field to a widely-constructed domain value (`Match`) is a
  cross-package change.** Generators, the aggregate, the infra repo, _and_ every
  test match-factory must set it in the same bundle or `typecheck` breaks. The
  repo's `as unknown as Row` cast let the DB-mapping land without regenerated
  types — useful when the local DB (gen:types) is unavailable.
- **Sequential test id factories collide across calls.** Using a fresh
  `mkIdFactory()` for both `generate()` and a later `addMatch()` produced two
  matches with id `m-1`; `.find(byId)` then returned the wrong one. Share one
  factory per bracket in tests (real ids are UUIDs). Cost a debug cycle.

## Follow-ups

- **Wire the draft lifecycle to the app (Phase 2/4):** `PublishBracketCommand` +
  `EditMatchCommand` / `AddMatchCommand` / `RemoveMatchCommand` / `SetPoolsCommand`
  / `SeedPlayoffCommand` / `ReplaceEntryCommand` / `ReopenBracketCommand`, then a
  draft-editing workspace and live-board inline edits. Drop the `publish()`
  bridge in the generate handlers at that point.
- **Run the migration locally + `gen:types`** (needs Docker, was down) so
  `database.types.ts` formally carries `best_of` / `target_score`; the repo
  cast is the stopgap.
- **Per-match `targetScore` is informational only** — surface it in the UI and
  scoreboard; not enforced by `determineWinner`.
- **e2e** for the full draft → publish → score → complete journey + a
  manual-edit case. Tracked in
  [docs/audits/tournament-tools-workflow.md](../audits/tournament-tools-workflow.md).

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(domain 479 tests incl. 68 bracket; application 101). E2E not run (no covered
journey yet for the new lifecycle).
