# Phase 4 (EventRepository) inc. 2 — `getDetail` decomposition into testable mappers (2026-05-29)

## Context

Second increment of the roadmap's structural Phase 4 (`EventRepository`
teardown). This one attacks **P2-3** ([architecture.md](../audits/architecture.md)):
`SupabaseEventRepository` was a 1,310-LOC adapter whose `getDetail` alone ran
~480 LOC — ~15 queries plus the inline assembly of the ~80-field
`EventDetailReadModel`. None of the parsing (waitlist math, team/payment merge,
winner-label preference, spots calc) could be unit-tested in pieces, and the
`{ capacity_kind, max_spots } → Capacity` mapping was duplicated as
`rowToCapacity` / `divisionRowToCapacity`.

(See the [inc. 1 journal](2026-05-29-bundle-phase-4-eventrepo-inc1-isp-split.md)
for the "Phase 4 (EventRepository)" naming note — distinct from the notification
"Phase 4 inc. 1–5" track.)

## Decisions

- **Extracted the pure parsing, kept the query orchestration in place — did NOT
  split into query-owning loaders.** The audit's `Fix` literally lists
  `loadAttendees` / `loadTeamsWithPayments` / … loaders + "`getDetail` becomes
  `Promise.all` of the loaders." I deliberately deviated: `getDetail` runs its
  queries in **two deliberate parallel waves** (Wave 2 depends on Wave 1's
  `registeredTeamIds` + `legacyDetail.format`), and that batching is the read
  path's performance characteristic. Query-owning loaders would either regress
  it (each awaits independently → more round-trips) or just push the same wave
  structure up a level for no real gain. The honest seam the audit is _after_
  ("can't be unit-tested in pieces") is the **parsing**, not the I/O — so the
  parsing moved to pure functions and the wave orchestration stayed.
- **New module `event-detail/mappers.ts`** holds the moved getDetail-local row
  types + pure mappers: `mapAttendees` (waitlist + `filledByPosition` in one
  chronological pass), `mapFreeAgents`, `mapCoHosts`, `tallyTeamMembers`,
  `indexPaymentsByTeam`, `mapRegisteredTeams`, `mapViewerCaptainedTeams`,
  `mapViewerHostableGroups`, `mapWinnerLabels`, `computeSpotsRemaining`, and the
  `toProfileLite` / `toGroupLite` mappers. All pure — rows in, read-model slices
  out, no Supabase client. Not barrel-exported (adapter-internal); the test
  imports them by path, mirroring the `escapeLike` precedent.
- **Deduped capacity mapping into one `capacityFromRow(...)`** taking the shared
  `{ capacity_kind, max_spots }` shape — both `events` and `event_divisions`
  carry the identical pair, so the two old copies collapse to one (3 call sites:
  `primaryDivisionFallback` ×2, `divisionRowToDomain`).
- **`getDetail` shrank ~480 → ~291 LOC.** The remainder is the two
  `Promise.all` query blocks (inherently verbose `.select(...)` strings) + the
  final read-model assembly — i.e. _just_ fetch + delegate + assemble, no
  parsing logic. The PGRST201 co-host FK-hint guard is preserved (moved up to
  fail fast right after Wave 1).
- **Added 16 mapper unit tests** ([mappers.test.ts](../../packages/infrastructure/src/event-detail/mappers.test.ts)).
  This is the payoff the audit wanted and chips at **P3-4** (thin infra/newer
  coverage). Each test pins a behaviour that previously only existed inside a
  live Supabase read: waitlist-once-over-target, no-roster-never-waitlists,
  unknown-position-ignored, null-profile fallback, positional vs. fixed vs.
  unlimited spots (+ zero-clamp), team/payment/division merge, drop-teamless-row,
  winner-label team-name-over-display-name, co-host split, hostable-group
  exclusion. infra suite 7 → 23.

## Changes

- **Infra** — new [event-detail/mappers.ts](../../packages/infrastructure/src/event-detail/mappers.ts)
  (334 LOC, pure) + [event-detail/mappers.test.ts](../../packages/infrastructure/src/event-detail/mappers.test.ts)
  (16 tests).
- **Infra** — [supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts):
  `getDetail` rewritten to delegate all parsing to the mappers (1,310 → 1,141
  LOC file); `rowToCapacity` + `divisionRowToCapacity` collapsed into
  `capacityFromRow`; dropped 6 now-unused domain read-model type imports.
- **No change** to the domain port, the application layer, the web layer, or the
  composition root. `getDetail`'s public contract (`EventDetailReadModel`) and
  query behaviour are byte-for-byte preserved.

## Patterns observed

- **When a god-method's value is in its parsing, extract pure mappers and leave
  the I/O orchestration alone.** Trying to honour a "loaders own their queries"
  recommendation literally would have fought the deliberate two-wave batching.
  The testability win comes from the pure functions; the query plan is a
  separate concern best left where its data-dependency ordering is visible.
- **A `{ shared columns } → VO` mapper beats per-table copies.** `capacityFromRow`
  taking a structural `{ capacity_kind, max_spots }` serves both event and
  division rows — worth checking for whenever two tables carry the same column
  pair.

## Follow-ups

Remaining on the roadmap's Phase 4 (tracked in
[architecture.md](../audits/architecture.md)):

- **P2-6 — consolidate the event-detail read path.** The 999-LOC
  [load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts)
  still spreads "one page's data" across `repo.getDetail()` + ~10
  `unstable_cache` helpers + admin reads, with the `reviveEventDetailDates()`
  Date-revival hack. Consolidating behind a single application-layer
  `GetEventDetailHandler` that owns composition + caching is the next increment.
- **P2-3 leftover (optional):** the `save` (~290 LOC) and `search` paths are
  still large; the same pure-mapper treatment (`event-row-mappers.ts` for the
  shared row→VO functions: `divisionRowToDomain`, `divisionToRow`,
  `rowToExtensions`, `primaryDivisionFallback`) could follow if those paths grow.

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(domain 267, application 42, web 55, infra **23** (was 7); lint 0 errors, 3
pre-existing warnings unrelated; build 8/8). No DB change.
