# TT-16 + TT-17: pool-play per-pool feasibility + DE grand-final disclosure (2026-06-05)

## Context

The last two P3s from the 2026-06-05 bracket-tool audit
([tournament-tools-workflow.md](../audits/tournament-tools-workflow.md)):

- **TT-16** — the pool-play create gate checked only `minTeamsForFormat` (4), not
  `poolCount × advancePerPool`. The global `generate()` guard and the picker's
  `poolPlayUnderfilled` warning cover the even/snake case, but a **hand-assigned
  uneven pool** (via `setPools` / Edit-pools) could leave one pool with fewer than
  `advancePerPool` teams while the global count still passed — surfacing late at
  `generatePlayoff` as a cryptic `rankAcrossPools` "missing position N".
- **TT-17** — the v1 double-elim grand final is a single match (no bracket reset),
  so the losers-bracket winner can take the title on the WB winner's first loss.
  A real generator limitation, but undisclosed to the host.

## Decisions

- **Catch the uneven pool where it's formed, not where it's consumed.** Added a
  `minAdvancePerPool` option to `generatePoolPlay`: right after the pool
  composition is resolved it throws a **pool-named** `ValidationError`. Wired from
  `Bracket.generate()` (`minAdvancePerPool: advancePerPool`), so the error lands at
  generate / Edit-pools time — exactly when the host can rebalance — instead of
  after every pool match has been played.
- **Keep a defense-in-depth guard in `generatePlayoff`.** Even though generation
  now blocks a short pool, `generatePlayoff` re-checks each pool's standings count
  and throws a pool-named error before `rankAcrossPools` can throw its generic one.
  Cheap, and it documents the invariant at the consumption site.
- **Factor config into the create gate.** `validateTeamCountForFormat` gained an
  optional `{ poolCount, advancePerPool }`; the create handler passes the resolved
  config (falling back to `DEFAULT_BRACKET_CONFIG`), so an under-configured pool
  field now fails at **create** with a clear message rather than at generate. The
  defaults are duplicated as `?? 2` inside `enums.ts` because it sits upstream of
  `bracket.ts` and can't import `DEFAULT_BRACKET_CONFIG` (noted in a comment).
- **TT-17 is disclosure, not a fix.** A true bracket-reset grand final is a
  generator change (roadmap). For now the double-elim format card says "Grand final
  is a single game (no bracket reset)" so hosts choose informed.

## Changes

- [enums.ts](../../packages/domain/src/brackets/enums.ts) — `validateTeamCountForFormat`
  takes optional pool config and enforces `poolCount × advancePerPool`.
- [generators.ts](../../packages/domain/src/brackets/generators.ts) — `generatePoolPlay`
  `minAdvancePerPool` option + pool-named `ValidationError`.
- [bracket.ts](../../packages/domain/src/brackets/bracket.ts) — `generate()` passes
  `minAdvancePerPool`; `generatePlayoff` keeps a pool-named feasibility guard.
- [bracket.handler.ts](../../packages/application/src/commands/bracket.handler.ts) —
  `CreateBracketHandler` passes the resolved pool config to the validator.
- [format-picker-form.tsx](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx)
  — DE card discloses the single grand final (TT-17).
- Tests: [enums.test.ts](../../packages/domain/src/brackets/enums.test.ts) (+1),
  [bracket.test.ts](../../packages/domain/src/brackets/bracket.test.ts) (+3:
  generatePoolPlay reject/allow + aggregate generate() reject),
  [bracket.handler.test.ts](../../packages/application/src/commands/bracket.handler.test.ts)
  (+1: create rejects under-configured pool play).

## Patterns observed

- **A "global count ≥ N" guard doesn't imply "every partition ≥ k".** The aggregate
  guard `seeds.length ≥ poolCount × advancePerPool` is necessary but not sufficient
  once pools can be **hand-assigned** unevenly. When a feature lets users partition
  a set, validate each partition, not just the total — and name the offending
  partition in the error.

## Follow-ups

- **Double-elim bracket-reset grand final** — the genuine TT-17 fix (WB winner gets
  a second game if they lose the final). Generator change; roadmap.
- This closes the **TT-9 … TT-17** bracket-audit backlog. The standalone e2e
  (publish-step + draft flow) remains deploy-gated, and TT-7/TT-8 still want a
  deploy verification.
