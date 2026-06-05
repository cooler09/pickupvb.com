# Double-elim parity: non-power-of-two byes + reset grand final (2026-06-05)

## Context

The two genuine double-elimination limitations the bracket audit had flagged as
roadmap items (TT-9 papered over the first with a power-of-two precondition; TT-17
disclosed the second):

1. **Power-of-two only.** `generateDoubleElimination` rejected any non-power-of-two
   field, so 5/6/7-team tournaments — extremely common — couldn't run double elim.
2. **Single grand final.** The losers-bracket champion could take the title on the
   winners-bracket champion's _first_ loss, which isn't true double elimination.

The user asked to implement both.

## Decisions

- **Build-full-then-prune for byes.** Rather than size the losers bracket to an
  uneven winners round, lay out the full `P = nextPow2(N)` skeleton, give the top
  seeds WB-R1 byes, and run a structural propagation — "will this slot ever hold a
  real team?" — to find the LB matches a bye starves. A bye match (one live slot)
  is pruned and its live feeder re-pointed at the bye's destination; a dead match
  (no live slots) is removed. Byes are processed by **descending round** so a chain
  of byes collapses onto the first real downstream match, and feeders are found by
  **live** edge scan (re-pointing as we go). Byes only ever occur in the losers
  bracket (for `N > P/2` every WB-R1 match holds ≥1 real seed and every WB-R2+ match
  is real), which bounds the whole thing to one bracket.
- **Keep WB-R1 byes as `bye` matches; prune LB byes.** WB-R1 byes auto-advance their
  team (like single-elim) and are shown as bye cards; LB byes are pruned (no team to
  show, and a runtime "one team + permanently-empty slot" would otherwise stall the
  bracket). Generation-time pruning keeps the runtime advancement code untouched.
- **Reset as a conditional final, handled in the aggregate.** The generator emits a
  second `final` match wired off the grand final, but the winner/loser edges can't
  express "only reset if the LB side wins." So the aggregate special-cases it:
  `grandFinalResetFor()` identifies the GF (a `final` feeding another `final`,
  guarded by `format === 'double_elimination'` so a pool-play playoff — whose
  matches are _all_ `bracketSide:'final'` — never trips it). On record:
  WB-side win → void the reset as a bye (lets the bracket complete); LB-side win →
  populate the reset (both teams, pending). `unwireAdvancement` clears it back to a
  clean slate on revert.
- **Hide the reset until it matters.** The board shows the reset only once it has
  teams — it's an empty bye when the WB team wins, and empty before the GF is played
  — so the common case shows a single "Final."

## Changes

- [generators.ts](../../packages/domain/src/brackets/generators.ts) — rewrote
  `generateDoubleElimination` (byes + reset emit); new `resolveLosersBracketByes`.
- [bracket.ts](../../packages/domain/src/brackets/bracket.ts) — `grandFinalResetFor`
  / `clearGrandFinalReset`; conditional reset in `applyAdvancement` /
  `unwireAdvancement` (direct + cascade).
- [enums.ts](../../packages/domain/src/brackets/enums.ts) — dropped the DE
  power-of-two check from `validateTeamCountForFormat` (floor of 4 stays); removed
  the now-dead `isPowerOfTwo` / `floorPowerOfTwo` helpers. **Supersedes TT-9.**
- [format-picker-form.tsx](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx)
  — removed the pow2 shape gate + `validateTeamCountForFormat` use; DE tradeoff now
  describes byes + the reset (**supersedes TT-17**'s disclosure).
- [setup-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/setup-view.tsx)
  — refreshed the gate comment (the logic auto-updates via the validator).
- [board-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx)
  — render GF + reset (hide an empty/voided reset; label the reset column "Reset").
- Tests: [bracket.test.ts](../../packages/domain/src/brackets/bracket.test.ts) (+6:
  6-team bye structure; 5/6/7-team playthrough to a champion; reset forced/voided;
  reset revert), [enums.test.ts](../../packages/domain/src/brackets/enums.test.ts)
  (DE accepts any 4+), [bracket.handler.test.ts](../../packages/application/src/commands/bracket.handler.test.ts)
  (rejects <4, accepts 6 via byes).

## Patterns observed

- **Conditional advancement doesn't fit the winner/loser-edge model — special-case
  it in the aggregate, gated by an aggregate-level fact.** The reset is "advance
  both, but only if a specific side won." Because pool-play playoffs also use
  `bracketSide:'final'`, the guard has to key on `this._format`, not just bracket
  side — a reminder that `bracketSide` is overloaded across formats.
- **Generation-time pruning beats runtime bye-detection.** Resolving byes when the
  graph is built (where the structure is fully known) kept `recordResult` /
  `applyAdvancement` oblivious to byes — they just follow edges. A runtime
  "is this slot a bye?" check would have leaked bracket-shape logic into scoring.

## Follow-ups

- The `pickLatestMatchId` spectator focus prefers the most-recent _completed_ match
  over the next _pending_ one, so during a live reset it highlights the just-finished
  grand final rather than the reset. Minor; left as-is.
- Run the double-elim e2e (`persona-sofia-tournament`) against dev after deploy — the
  4-team path is covered but the byes + reset paths are unit-only so far.
