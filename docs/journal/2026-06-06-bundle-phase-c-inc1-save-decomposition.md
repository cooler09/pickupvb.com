# Phase C inc. 1 — decompose `SupabaseEventRepository.save()` (2026-06-06)

## Context

The 2026-06-06 re-audit graded **P2-2**: `supabase-event-repository.ts` had
regrown to ~1,468 LOC with a **~330-LOC non-atomic `save()`** (and a ~316-LOC
`getDetail`). The audit's fix is three folded parts — (1) extract `getDetail`'s
query waves into loaders, (2) decompose `save()` into per-child write helpers,
(3) wrap the multi-statement write in a `SECURITY DEFINER` RPC for atomicity —
and it mandates **characterization tests on `save()`/`getDetail` first**. This
increment does part (2) behind that test net. See
[architecture.md § Reevaluation — 2026-06-06](../audits/architecture.md#reevaluation--2026-06-06).

## Decisions

- **Characterization test first, then verbatim extraction.** Wrote
  [supabase-event-repository.test.ts](../../packages/infrastructure/src/supabase-event-repository.test.ts)
  against the _original_ `save()`: a recording fake PostgREST client (thenable
  builder that logs every terminal op + filters, and resolves
  `event_divisions.select('id')` to a row so `soleDivisionId` resolves) driven by
  a populated event, asserting the exact ordered write sequence (`events.upsert`
  → `event_divisions.select` → attendees → waitlist → teams → free agents) plus
  the division-id thread-through in the insert payloads. Confirmed green, _then_
  extracted — so the relocation provably can't reorder, drop, or mis-thread a
  block.
- **Extracted to a sibling module, not private methods.** The five reconcilers +
  the `divisionToRow` mapper + the division-id load moved into
  [event-save-children.ts](../../packages/infrastructure/src/event-save-children.ts)
  as free functions taking `(client, …)`. Private methods would have shrunk the
  _method_ but not the _file_; P2-2 flags both. The functions are now
  independently unit-testable too.
- **Verbatim relocation.** Same queries, same order, same error strings, same
  `23505`-swallow on the free-agent insert, same `NO_DIVISION` sentinel — only
  `this.client` → a `client` param. No behaviour change (the char test is the
  proof).
- **Added an injectable `constructor(client?)`** to the adapter — the test seam,
  matching the sibling adapters (`supabase-event-payment-repository`, etc.).
  Production callers still `new SupabaseEventRepository()` and get the lazy admin
  client.
- **Deferred atomicity (inc. 3).** The reconcilers are still _sequential and
  non-transactional_ — a partial failure mid-`save()` still half-writes. True
  atomicity needs a `SECURITY DEFINER` RPC reimplementing the delta logic in
  PL/pgSQL (a migration that can't be verified locally — AGENTS.md), so it stays
  the explicit P2-2 follow-up rather than being rushed into this structural pass.

## Changes

- New [event-save-children.ts](../../packages/infrastructure/src/event-save-children.ts)
  (358 LOC): `loadDivisionIds`, `reconcileAttendees`, `reconcileWaitlist`,
  `reconcileRosterTeams`, `reconcileFreeAgents`, `reconcileDivisions`, +
  `divisionToRow` (moved out of the adapter).
- [supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts)
  (1,468 → 1,199 LOC): `save()` is now `events` upsert → `loadDivisionIds` → five
  `reconcile*` calls → `pullEvents()`; gained the injectable constructor; lost
  the inline `divisionToRow`.
- New [supabase-event-repository.test.ts](../../packages/infrastructure/src/supabase-event-repository.test.ts)
  (2 cases) — the `save()` write-sequence characterization (infra suite 48 → 50).

## Patterns observed

- A recording **thenable** fake (`then(onfulfilled, onrejected)` matching
  `PromiseLike`) is enough to characterize a PostgREST adapter's _write sequence_
  without a live DB — it logs `(table, op, payload, filters)` per terminal call.
  Pin the **order + key payloads**, not every filter, to stay non-brittle.
- `implements PromiseLike<T>` requires the full two-type-param `then` signature;
  a narrowed `then<T>(resolve)` compiles under esbuild (tests pass) but fails
  `tsc`. Match the real signature.

## Follow-ups

- **P2-2 inc. 2:** extract `getDetail`'s two parallel query waves into loader
  functions (parsing already lives in `event-detail/mappers.ts`) to shrink the
  adapter further.
- **P2-2 inc. 3:** multi-statement `save()` atomicity via a `SECURITY DEFINER`
  RPC — the carried-over deferral; deploy-gated (migration, unverifiable
  locally). Tracked in [architecture.md](../audits/architecture.md#refactoring-roadmap-2026-06-06).
