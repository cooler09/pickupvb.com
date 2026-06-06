# Phase B — unify the parallel bracket command hierarchies (2026-06-06)

## Context

The 2026-06-06 architecture re-audit graded **P2-1**: `standalone-bracket.handler.ts`
duplicated ~13 handlers from `bracket.handler.ts` over the _same_ `Bracket`
aggregate (and the command classes duplicate again in `messages.ts`). Both
hierarchies were `load → mutate → save → dispatch`; the **only** real difference
is the resolve step — event handlers find-by-division + assert event-host,
standalone find-by-id + assert owner. Every new bracket op had to be written
twice. See [architecture.md § Reevaluation — 2026-06-06](../audits/architecture.md#reevaluation--2026-06-06).

## Decisions

- **Shared base class, not a generic single-handler set.** The audit floated
  either a `BracketCommandBase` or an injected strategy. The deciding constraint
  was the **test net**: both `bracket.handler.test.ts` and
  `standalone-bracket.handler.test.ts` (33 cases) construct handlers directly
  (`new PublishStandaloneBracketHandler(repo)`) and pin per-op behaviour + the
  host/owner gates. A fully-generic single handler set would have forced a test
  rewrite (losing the regression net) and either unified the command shapes
  (churning ~26 web call sites) or pushed the per-op mutation closures into the
  composition root (`handlers.ts`, the web layer) — leaking application logic
  outward. So: **keep every handler class, command class, registry key, and test
  file**; lift only the shared _flow_ into a base.
- **Two-level base.** `BracketStructuralHandler` owns `brackets` + `analytics`
  and a `runMutation(bracket, mutate)` that does mutate → host-only `save` →
  outbox dispatch. `EventBracketStructuralHandler extends` it, adding `events` +
  a `loadHost(divisionId, requesterId)` resolver. Event handlers extend the
  latter and resolve via `loadHost`; standalone handlers extend the former and
  resolve via the file-local `loadOwnedBracket`. Each `execute` is now
  `const b = await <resolve>; await this.runMutation(b, (x) => x.op())`.
- **Centralizing the persist tail hardens pattern #9.** The analytics-outbox
  dispatch was 26 hand-copied `if (this.analytics) dispatchAnalyticsOutbox(...)`
  lines — easy to forget on a new handler. It now lives once in `runMutation`, so
  it's structurally impossible to omit for any handler that persists via the base.
- **Accepted LOC above the ~650 estimate (landed 939).** The estimate assumed
  eliminating the handler/command classes; keeping them (for the test net + zero
  call-site churn) is the right trade. The duplication that _mattered_ — the
  per-op load/mutate/save/dispatch logic — is gone; what remains is thin,
  uniform class scaffolding.
- **Left the captain-RLS handlers independent.** `RecordMatchResultHandler` /
  `ResetMatchHandler` persist via `saveAsMatchActor` (RLS-gated RPC), not the
  host-only `save`, so they deliberately do **not** use `runMutation`.

## Changes

- [bracket.handler.ts](../../packages/application/src/commands/bracket.handler.ts)
  (624 → 534): added `BracketStructuralHandler` + `EventBracketStructuralHandler`
  bases; rewrote the 13 event structural handlers + `CreateBracketHandler` to
  extend the event base and use `loadHost` + `runMutation`. `RecordMatchResult` /
  `ResetMatch` + the `buildMatchPatch` / `buildAddMatchInput` helpers unchanged.
- [standalone-bracket.handler.ts](../../packages/application/src/commands/standalone-bracket.handler.ts)
  (491 → 405): every handler now `extends BracketStructuralHandler` (imported
  from the event file); bodies collapsed to `loadOwnedBracket` + `runMutation`.
  Dropped the now-unused `dispatchAnalyticsOutbox` + `AnalyticsPort` imports.
- No change to `messages.ts`, `handlers.ts` wiring, web call sites, or either
  test file.

## Patterns observed

- When two handler hierarchies differ only in a load/authz step, a base class
  that owns the _invariant_ tail (persist + side-effects) and exposes the
  _variant_ step as a protected hook collapses the duplication without the
  type-gymnastics of a generic strategy — and keeps each handler greppable.
- A repeated cross-cutting side-effect (outbox dispatch) copy-pasted across N
  handlers is a latent pattern-#9 hazard; centralizing it in the shared persist
  helper is as much a correctness win as a DRY one.

## Follow-ups

- Phase C (**P2-2**): `supabase-event-repository.ts` decomposition + multi-statement
  `save()` atomicity (the largest remaining item) — see
  [architecture.md](../audits/architecture.md#refactoring-roadmap-2026-06-06).
- P3-2 (`messages.ts` 761-LOC single-module) is the natural place to also split
  the bracket command classes per-subdomain if that file is ever broken up.
