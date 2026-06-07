# Phase C inc. 2 — extract `getDetail`'s query waves into loaders (2026-06-06)

## Context

Part (1) of the P2-2 fix: the ~316-LOC `getDetail` god-method ran two parallel
read waves (+ a conditional podium read + a viewer-team read) inline before
delegating parsing to the already-extracted `event-detail/mappers.ts` (Phase 4
inc. 2). This increment lifts the **I/O** out so `getDetail` reads as an
orchestrator. See
[architecture.md § Reevaluation — 2026-06-06](../audits/architecture.md#reevaluation--2026-06-06).

## Decisions

- **Characterization test first.** Extended
  [supabase-event-repository.test.ts](../../packages/infrastructure/src/supabase-event-repository.test.ts):
  the recording fake gained `maybeSingle()` + an injectable canned-read resolver
  (so the same harness serves both the `save()` write-sequence and the
  `getDetail` read-sequence tests). 3 new cases pin the read-query **sequence**
  (event row → wave 1 → viewer-scoped wave 2, with the host-group / team /
  viewer conditionals correctly skipped), a couple of key filters (`id`,
  `division.event_id`), and the null-event early return. Green vs the original,
  still green after the extraction.
- **Private methods, not a separate module.** The four loaders are
  `private async` methods on the adapter, not free functions in a new file.
  Reason: the waves are tightly coupled to the **repo-local** `DivisionRow` /
  `EventRow` row types (used across `findById`, `divisionRowToDomain`,
  `divisionRowToLite`, `primaryDivisionFallback`). A module split would have
  forced relocating those types (and risked a type-level import cycle) for **no
  behavioural gain**. So the win here is the _method_ decomposition + query
  isolation, not file shrink — file 1,199 → 1,264 LOC (+65 from method
  scaffolding + JSDoc); net **−14%** across inc. 1+2 vs the audit baseline. (inc.
  1 already did the file-shrinking extraction where the types allowed it.)
- **Loaders return the raw result objects.** Each loader returns the same
  `{ data, error }` PostgREST result objects the inline `Promise.all` produced
  (`{ attendeeRowsRes, coHostRowsRes, … }`), so every downstream `.data as X`
  cast + the entire parse/compute/assemble tail is **byte-identical** — only the
  query chains moved. The co-host FK-hint error check moved into
  `loadDetailWave1` (its natural home).

## Changes

- [supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts):
  `getDetail` 316 → 184 LOC; the two `Promise.all` waves + the podium read + the
  viewer-team read replaced by calls to four new private loaders —
  `loadDetailWave1`, `loadPodiumLabels`, `loadDetailWave2`,
  `loadViewerTeamMemberCounts`.
- [supabase-event-repository.test.ts](../../packages/infrastructure/src/supabase-event-repository.test.ts):
  `FakeBuilder` gained `maybeSingle()` + a `canned` resolver; `recordingClient`
  takes the resolver; +3 getDetail read-sequence cases (infra suite 50 → 53).

## Patterns observed

- When the extracted I/O is coupled to repo-local row types, **private methods
  beat a module split** — you get the readability/isolation win without dragging
  shared types across a new boundary. Reserve the module split (inc. 1's
  `event-save-children.ts`) for blocks whose dependencies already live in shared
  modules.
- One recording-fake harness covers both write- and read-sequence
  characterization if it takes an injectable canned-read resolver +
  `maybeSingle()` — pin the **query sequence + the conditionals that gate which
  queries fire**, not the embed payloads (those are the mappers' tests' job).

## Follow-ups

- **P2-2 inc. 3 (the only remaining piece):** true multi-statement `save()`
  atomicity via a `SECURITY DEFINER` RPC — the carried-over deferral; a migration
  to the hottest write path, deploy-gated and unverifiable locally (AGENTS.md),
  so it wants its own deliberate pass + deployed e2e verification. Tracked in
  [architecture.md](../audits/architecture.md#refactoring-roadmap-2026-06-06).
