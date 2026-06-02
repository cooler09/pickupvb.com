# Seeding + cost-split shipped; shared roster lib extracted (2026-06-02)

## Context

Closing out the pure-client half of the [host-tools
roadmap](2026-06-01-host-tools-roadmap.md) after the
[randomizer](2026-06-02-team-randomizer.md) and
[scheduler](2026-06-02-round-robin-scheduler.md). This bundle ships the last two
no-backend tools — [`/tools/seeding`](../../apps/web/src/app/tools/seeding/page.tsx)
and [`/tools/cost-split`](../../apps/web/src/app/tools/cost-split/page.tsx) — and
extracts the roster primitives all three now share. All four `soon` tiles that
were pure-client are now `live`.

## Decisions

- **Extracted `app/tools/_lib/roster.ts` (DRY).** Cost-split was the _third_
  consumer of "name + optional trailing number" parsing (randomizer = rating,
  seeding = rating, cost-split = share weight), and seeding wanted the same
  snake draft as the randomizer's balanced mode. Rather than copy the regex /
  draft loop a third time, lifted `Player`, `parseRoster`, `hasRatings`,
  `shuffle`, and a generic `snakeDistribute<T>` into a shared `_lib`. Serves the
  standing DRY/SOLID initiative. The number's _meaning_ stays the consumer's —
  the parse is purely syntactic.
- **Refactored `split.ts` onto the shared lib, re-exporting for back-compat.**
  `team-randomizer/_lib/split.ts` now imports the primitives and re-exports
  `Player`/`parseRoster`/`hasRatings`/`shuffle`, so the randomizer component and
  its callers changed **zero** imports. Balanced mode is now
  `snakeDistribute(orderedByRating, n)` — the bespoke snake loop is gone.
- **Moved the primitive tests to `roster.test.ts`; trimmed `split.test.ts`** to
  the team-shaped logic only. The refactor was safe precisely because these
  tests pin the behavior — green before and after.
- **Seeding: random → button, pools → live.** Like the randomizer it draws on a
  button (random mode needs an event-triggered `Math.random`), but it stores the
  _drawn seed order_ and re-derives the pool distribution live as the pool count
  changes — so you can re-pool without re-drawing. Ranked = stable sort by rating
  desc (unrated sink, input order preserved); snake into pools reuses
  `snakeDistribute`.
- **Cost-split: deterministic → live, integer cents.** Derived in render (no
  button), per the scheduler pattern. Splits in whole **cents** with
  largest-remainder rounding so the per-person amounts always sum back to the
  exact total — the headline invariant, and its unit test. The trailing number
  is read as a share weight ("Alex 2" pays double; "Free 0" pays nothing).

## Changes

- `app/tools/_lib/roster.ts` + `roster.test.ts` — **new** shared primitives
  (`Player`, `parseRoster`, `hasRatings`, `shuffle`, `snakeDistribute`).
- `app/tools/team-randomizer/_lib/split.ts` — refactored onto roster.ts
  (re-exports for back-compat; balanced uses `snakeDistribute`).
  `split.test.ts` — trimmed to splitTeams/teamSummary/formatTeamsText.
- `app/tools/seeding/{_lib/seeding.ts,_lib/seeding.test.ts,_components/seeding.tsx,page.tsx}`
  — **new** seeding tool (ranked/random order, snake-into-pools).
- `app/tools/cost-split/{_lib/cost.ts,_lib/cost.test.ts,_components/cost-split.tsx,page.tsx}`
  — **new** cost splitter (even / by-shares, exact-cent).
- `app/tools/page.tsx` — seeding + cost-split tiles `soon` → `live`.
- `app/sitemap.ts` — added both routes.

## Patterns observed

- **The third copy is the extract trigger.** Two near-identical parses were
  tolerable; the third (cost-split) was the signal to lift the primitive — and
  the re-export kept it a zero-churn move for the existing tool. Same playbook as
  the persona-ux vocabulary ratchets: collapse the drift when it reaches three.
- **One generic (`snakeDistribute`) now serves two unrelated features** —
  balanced team-splitting and pool seeding — because both are "deal a sorted list
  into N buckets, snaking." Worth more than either bespoke loop.
- **The pure-`_lib` + island shape now has all three button/live variants on
  record:** random-with-button (randomizer), random-draw-then-live-derive
  (seeding), and fully-live deterministic (scheduler, cost-split). Future tools
  pick the variant by whether `Math.random` is in the pipeline.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green; new routes
`ƒ /tools/seeding` and `ƒ /tools/cost-split` in the manifest; web suite 172
tests (roster 9, seeding 7, cost 9, split trimmed to 8). Not run: e2e (no
covered journey).

## Follow-ups

- **All four pure-client roadmap tools are now live.** Remaining are the three
  shared-multi-device tools (standings / timer / rotation), which still want the
  scoreboard's room/Realtime primitive extracted into a shared `_lib` first — the
  bigger lift flagged in the [roadmap](2026-06-01-host-tools-roadmap.md).
- Deferred seeding/cost niceties: seeded _bracket_ export (feed the bracket
  tool), and a tip/round-up line on the cost splitter.
