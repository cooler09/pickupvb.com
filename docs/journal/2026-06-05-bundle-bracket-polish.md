# Bracket polish bundle (2026-06-05)

## Context

The deferred follow-ups left across the bracket effort (audit
[tournament-tools-workflow.md](../audits/tournament-tools-workflow.md) remediation
logs + journals). Five small items, none of them new findings.

## Decisions

- **Add-a-game: extract, don't duplicate.** The draft workspace already had an
  `AddMatchButton`; the live board wanted the same affordance (the domain allows
  `addMatch` while `active`). Extracted it to a shared
  [`add-match-button.tsx`](../../apps/web/src/app/events/[id]/bracket/_components/add-match-button.tsx)
  rather than copy it, and gated it to "free" schedules (pool play / round robin)
  — elimination brackets are wired and must not gain ad-hoc games.
- **seedPlayoff: wire the dead handler, recompute the pre-fill order.**
  `SeedPlayoffHandler` was unreachable (no action/UI/standalone). The re-seed picker
  needs to pre-fill the _current_ cross-seed order so an untouched submit is a
  no-op; rather than invert `bracketSlots` from the existing playoff, the board
  recomputes it with `rankAcrossPools(computePoolStandings(...), advancePerPool)` —
  the same function that produced the auto seed. `advancePerPool` is threaded to
  `BoardView` from both host pages. The picker reuses the existing drag-reorder
  `SeedingList`.
- **Focus heuristic: narrow, not broad.** `pickLatestMatchId` now prefers a pending
  final of a _higher round than any completed final_ — the double-elim reset
  (round = grand-final + 1) or a championship awaiting both semifinalists. Keying
  on "higher round than a completed final" avoids changing normal single-elim /
  in-progress focus.
- **List delete: 2-step, no nested interactive.** A `<details>` "Delete bracket"
  disclosure below each row (not a button inside the row `<Link>`), mirroring the
  detail-page danger zone — avoids both accidental deletes and an invalid
  button-in-anchor.
- **Stale-data: it was already done.** The "drop the legacy `team_*_id` columns"
  follow-up turned out to be obsolete — migration `20260813000000` dropped them
  months ago. The remaining staleness was the _comments_ claiming the columns are
  "kept nullable, no longer written." Fixed the comments; no migration.

## Changes

- [add-match-button.tsx](../../apps/web/src/app/events/[id]/bracket/_components/add-match-button.tsx)
  (new, extracted from draft-workspace) +
  [draft-workspace.tsx](../../apps/web/src/app/events/[id]/bracket/_components/draft-workspace.tsx)
  (import the shared one).
- [board-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx)
  — add-game on the live board; re-seed button; `pickLatestMatchId` deciding-final
  preference; `advancePerPool` prop.
- [reseed-playoff-button.tsx](../../apps/web/src/app/events/[id]/bracket/_components/reseed-playoff-button.tsx)
  (new).
- seedPlayoff wiring: event action `seedBracketPlayoffFromForm`
  ([actions.ts](../../apps/web/src/app/events/[id]/bracket/actions.ts)), standalone
  `SeedStandalonePlayoff` command/handler
  ([standalone-bracket.handler.ts](../../packages/application/src/commands/standalone-bracket.handler.ts))
  - action ([brackets/actions.ts](../../apps/web/src/app/brackets/actions.ts)),
    composition root ([handlers.ts](../../apps/web/src/lib/handlers.ts)), binding +
    `seedPlayoffFromForm`
    ([bracket-action-binding.ts](../../apps/web/src/app/events/[id]/bracket/_components/bracket-action-binding.ts)),
    `playoff_reseeded` notice
    ([labels.ts](../../apps/web/src/app/events/[id]/bracket/_components/labels.ts)),
    `advancePerPool` threaded through the page → workspace → board.
- [brackets/page.tsx](../../apps/web/src/app/brackets/page.tsx) — list-row delete.
- [match.ts](../../packages/domain/src/brackets/match.ts) — stale-comment fix.
- Tests: 2 `Bracket.seedPlayoff` domain tests
  ([bracket.test.ts](../../packages/domain/src/brackets/bracket.test.ts)).

## Patterns observed

- **A shared test id factory is load-bearing.** The seedPlayoff tests first failed
  because each `b.generate(mkIdFactory())` / `b.generatePlayoff(mkIdFactory())` got
  a _fresh_ counter starting at `m-1`, producing duplicate match ids — and
  `matchOrThrow` (`.find`) then resolved a later `recordResult` to the wrong (pool)
  match. The real repo uses UUIDs, so this is a test-only trap: thread **one**
  `mkIdFactory()` through the whole lifecycle, mirroring production id uniqueness.
  Worth remembering for any multi-generate test (pool → playoff → re-seed).

## Follow-ups

- None outstanding for the bracket tool — the TT-9…TT-17 backlog and the two
  roadmap generator features are all done; this clears the deferred polish. The
  remaining work is the deploy + e2e verification noted in the prior entries
  (standalone draft flow, DE byes/reset, TT-7/TT-8), now joined by the new
  add-game / re-seed paths (unit-tested, e2e-pending).
