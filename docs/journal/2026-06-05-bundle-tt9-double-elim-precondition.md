# TT-9: enforce the double-elimination team-count precondition up-front (2026-06-05)

## Context

The 2026-06-05 bracket-tool audit
([tournament-tools-workflow.md](../audits/tournament-tools-workflow.md), finding
**TT-9**, P1) found the create-time gate and the generator disagreed on what a
valid double-elimination field is:

- `minTeamsForFormat('double_elimination')` returned **3** and the format picker
  advertised the same, but `generateDoubleElimination` requires **N ≥ 4 AND N a
  power of two** (4/8/16/32).
- `CreateBracketHandler` validated only the bare count, so a host could create +
  seed a DE bracket with 3/5/6/7/9–15 teams and only hit a cryptic
  `ValidationError` at **Generate**. For a division (count is registration-driven)
  that's a dead-end; for a free standalone owner it's worse (format fixed at
  create, at the 1-bracket cap, no delete — see TT-12).

## Decisions

- **One domain rule, three gates.** Chose a single
  `validateTeamCountForFormat(format, teamCount)` in the domain over duplicating
  the power-of-two check in the handler + two UI components. It returns
  `{ ok } | { ok: false; reason }` so every caller surfaces the **same** actionable
  message ("you have 6 — drop to 4 or add 2 to reach 8").
- **Gate at create _and_ at Generate.** The create handler + format picker stop a
  division host before they commit; the `SetupView` Generate gate is the common
  chokepoint that also covers **standalone** (whose create path intentionally
  doesn't enforce a count — teams are added later). Belt-and-suspenders, because
  registrations can drop a field below a power of two after create.
- **Fail fast now, real fix later.** Chose to keep the v1 power-of-two restriction
  and guard it cleanly rather than build non-power-of-two DE (byes in WB R1) in
  this bundle — that's the durable fix but a much larger generator change. Logged
  as a roadmap follow-up.
- **Client imports a runtime domain function.** `validateTeamCountForFormat` is
  pure, and `'use client'` files already import runtime domain values
  (`getBadgeDefinition`, `EVENT_POSITIONS`), so reusing it in the picker + setup
  view is idiomatic and keeps the rule DRY.

## Changes

- [enums.ts](../../packages/domain/src/brackets/enums.ts) — `minTeamsForFormat`
  DE floor 3 → 4; new `validateTeamCountForFormat` (+ private `isPowerOfTwo` /
  `floorPowerOfTwo`).
- [enums.test.ts](../../packages/domain/src/brackets/enums.test.ts) — new; pins the
  floor bump and the power-of-two rule (4/8/16/32 ok; 3/5/6/7/9/15 rejected; the
  6-team "drop to 4 / reach 8" hint).
- [bracket.handler.ts](../../packages/application/src/commands/bracket.handler.ts) —
  `CreateBracketHandler` swaps the bare `minTeamsForFormat` count check for
  `validateTeamCountForFormat`.
- [bracket.handler.test.ts](../../packages/application/src/commands/bracket.handler.test.ts)
  — new `CountRepo` fake + two cases (rejects 6-team DE before `save`; accepts
  8-team DE).
- [format-picker-form.tsx](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx)
  — DE `minTeams` 3 → 4; shape-check disables Create + shows the reason when the
  field isn't a power of two (skipped for standalone create, `enforceMin=false`).
- [setup-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/setup-view.tsx)
  — Generate gated on `validateTeamCountForFormat`; reason rendered under the
  readiness summary.

## Patterns observed

- **Min-count floors aren't always sufficient preconditions.** A format can meet
  its team minimum and still be unbuildable (DE's power-of-two shape). When a
  generator throws a structural `ValidationError`, the matching create-time guard
  should mirror the _exact_ precondition, not just a count — otherwise the failure
  lands late and far from the input. `validateTeamCountForFormat` is the place to
  add the next such rule.

## Follow-ups

- **Non-power-of-two double elimination** (byes in WB R1) so 5/6/7-team fields can
  run DE at all — the durable fix; until then the guard fails fast. Tracked in
  [tournament-tools-workflow.md TT-9](../audits/tournament-tools-workflow.md).
- The rest of the bracket-tool audit backlog (TT-10…TT-17) — standalone
  reopen/edit/delete parity, watch-badge + targetScore fixes — remains open in the
  same audit file.
