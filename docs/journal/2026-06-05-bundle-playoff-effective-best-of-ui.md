# Playoff matches now adhere to their effective best-of in the score form (2026-06-05)

## Context

User report: "The matches in the playoff bracket don't always adhere to the
format. I edited the match to be best of 1 to 21 from a best of 3 and it
didn't mark the win once I saved 21."

Root cause was **not** in the domain. `Bracket.recordResult` already resolves
a match's effective best-of with the correct precedence (per-match override →
playoff-stage default → global) and the existing test
[`bracket.test.ts` "a per-match bestOf override drives recordResult"](../../packages/domain/src/brackets/bracket.test.ts)
proves it. The bug was in the **UI**: every page handed `BoardView` →
`MatchCard` the bracket-wide `bracket.config.bestOf` (the pool / global
default), and `MatchCard` used that single number to decide how many set
inputs to render (`setsToShow = max(bestOf, sets.length + 1)`) and what
"Best of N" to label. So a `final` match whose real length differs — a
per-match override, or a distinct `playoffBestOf` (best-of-1 pool play,
best-of-3 playoff is the canonical ADR 0032 setup) — rendered against the
wrong default: too few/many score boxes, and a saved score that never
clinched because the host couldn't enter enough sets.

## Decisions

- **Resolve the effective length in one place and share it** over duplicating
  the precedence in the UI. Promoted the private `Bracket.effectiveBestOf` to
  an exported pure helper `effectiveBestOf(match, { bestOf, playoffBestOf })`
  in `match.ts` (plus a twin `effectiveTargetScore`) and had `Bracket`
  delegate to it. The UI imports the same function, so the score form can
  never drift from the winner resolution. Chose this over a UI-local copy
  because a copy is exactly how the two got out of sync.
- **Thread the playoff-stage defaults through, rather than precomputing per
  match at the page.** `BoardView` iterates matches and renders one `MatchCard`
  each, so the per-match resolution has to happen there; the page only knows
  the bracket-wide config. Added `playoffBestOf` / `playoffTargetScore` props
  alongside the existing `bestOf` / `targetScore` and resolve per card.
- **`PoolsView` left untouched** — pool matches are always `bracketSide: null`,
  so the playoff-stage default never applies; their per-match override
  (`m.bestOf`) is already honored because the helper reads it off the match.
- **MatchEditor "Default" label now reflects the stage default**, not the
  global one: a `final` match's editor offers "Default (best of 3)" when
  `playoffBestOf = 3`, so clearing an override falls back to the length the
  match is actually scored at.

## Changes

- `packages/domain/src/brackets/match.ts` — new exported `effectiveBestOf` /
  `effectiveTargetScore` pure helpers + their default-shape interfaces.
- `packages/domain/src/brackets/bracket.ts` — delete the private
  `effectiveBestOf`; `recordResult` calls the shared helper.
- `packages/domain/src/brackets/bracket.test.ts` — resolver unit tests
  (per-match override / playoff-stage / global precedence, both metrics).
- `apps/web/.../bracket/_components/match-card.tsx` — resolve `matchBestOf` /
  `matchTargetScore` from the helper; `setsToShow`, the length label, and the
  Score-live button now use the resolved values. New `playoffBestOf` /
  `playoffTargetScore` props.
- `apps/web/.../bracket/_components/board-view.tsx` — accept + pass the playoff
  defaults to `MatchCard`; compute the per-match stage default for `MatchEditor`.
- `apps/web/.../bracket/_components/bracket-workspace.tsx` + `bracket/page.tsx`
  — carry `playoffBestOf` / `playoffTargetScore` on the serializable VM.
- `apps/web/.../brackets/[id]/page.tsx`, both `watch/page.tsx` — pass the two
  config fields into `BoardView`.

## Patterns observed

- **A domain resolution the UI must mirror should be an exported pure helper,
  not a private method.** When the winner rule lives in the aggregate but the
  form needs the same answer to render inputs, copying the rule into the
  component is a latent divergence. This is the second "the score form's idea
  of the format drifted from the domain's" class of bug in the bracket area.

## Follow-ups

- The live-scoreboard finalize path (ADR 0023) records through the domain, so
  it was already correct; the Score-live launcher now also seeds the scoreboard
  with the per-match effective best-of (cosmetic improvement, not a fix).
- e2e for the bracket flow remains deploy-gated (see the bracket initiative
  memory); a Playwright case asserting "best-of-1 playoff override → one score
  box → save clinches" would pin the UI half of this fix but needs a green dev
  run first.
