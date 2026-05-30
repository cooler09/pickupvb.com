# Phase 4 (EventRepository) inc. 1 — ISP split of the `EventRepository` port (2026-05-29)

## Context

Opens the architecture roadmap's **Phase 4 — split `EventRepository` +
decompose the adapter** ([architecture.md](../audits/architecture.md), findings
P2-2 / P2-3 / P2-6). This first increment attacks **P2-2** only: the
`EventRepository` god-port conflated four responsibilities behind one
interface, so every handler that needed `findById` also "saw" `getDetail`,
`search`, `addCoHost`, `setRosterTeamForfeited`, … — an Interface-Segregation
violation, and the header comment openly admitted the read/write CQRS mixing.

> **Naming note (read this first):** the execution log earlier today already
> spent the label "Phase 4 inc. 1–5" on the **notification subdomain** (P2-1
> fix #3 — outbox/worker/push/broadcasts/prefs). That track is complete. This
> is a _different_ track: the roadmap's structural "Phase 4" (the
> `EventRepository` teardown). To disambiguate, these increments are labeled
> **"Phase 4 (EventRepository) inc. N"** in the journal and the audit status
> block. Same date, different finding.

## Decisions

- **Three slices, keyed on responsibility, matching the audit's `Fix` text.**
  - `EventWriteStore { findById; save }` — write-side aggregate persistence.
    `findById` returns the `VolleyballEvent` aggregate, so load-then-authorize
    reads (bracket/league-schedule/league-roster/team-registration handlers)
    depend on this slice too, not a separate reader. Kept `findById` + `save`
    together per the audit, rather than over-splitting into a read/write pair.
  - `EventReadModels { search; getDetail; findIdByShortCode }` — denormalized
    CQRS read projections shaped for the UI.
  - `EventMembershipStore { addCoHost; removeCoHost; setRosterTeamForfeited }`
    — focused sub-resource mutations that are **not** aggregate state (co-host
    edges, the league roster forfeit flag).
- **Retained `EventRepository` as a composed union** (`extends EventWriteStore,
EventReadModels, EventMembershipStore`) rather than deleting it. Chose this
  over a hard split because (a) `SupabaseEventRepository implements
EventRepository` and the composition root pass the same instance to every
  handler — one concrete adapter still backs all three slices (the audit's
  "the Supabase class can still implement all of them" path); and (b) the test
  fakes (`Pick<EventRepository, 'findById' | 'save'>`,
  `… as unknown as EventRepository`) keep compiling untouched. Zero churn in
  [handlers.ts](../../apps/web/src/lib/handlers.ts) and the four
  `*.handler.test.ts` files — the same shape as the Bundle 132 `useToast()`
  "preserve the public API, narrow nothing the call-site cares about" move.
- **Narrowed every handler constructor to its slice** — that _is_ the ISP fix.
  Leaving them on `EventRepository` would have renamed nothing. `league-roster`
  needs both `findById` and `setRosterTeamForfeited`, so it takes the explicit
  intersection `EventWriteStore & EventMembershipStore` (honest about its two
  concerns) rather than falling back to the union.
- **`GetEventByIdHandler` depends on `EventWriteStore`, not a read slice.** It's
  a query handler, but it projects a summary _from the aggregate_ via
  `findById` — `findById` lives on the write store, so that's its real
  dependency. The CQRS read/write separation is in the _handlers_ (queries vs.
  commands); the _port_ slicing follows method shape (aggregate vs. read
  model), which is why a query handler can legitimately sit on `EventWriteStore`.
- **No new tests.** Pure type-level structural refactor — no behavior, no domain
  rule, no new branch. The existing 42 application + 267 domain tests already
  exercise these handlers through the slices.

## Changes

- **Domain** — [event-repository.ts](../../packages/domain/src/events/event-repository.ts):
  replaced the monolithic `EventRepository` interface with `EventWriteStore` /
  `EventReadModels` / `EventMembershipStore` + a composed
  `EventRepository extends …` union. Read-model shapes below are unchanged. The
  events barrel re-exports the new interfaces automatically (`export *`).
- **Application** — narrowed constructor dependency types:
  - `EventWriteStore`: [create-event](../../packages/application/src/commands/create-event.handler.ts),
    [join-event](../../packages/application/src/commands/join-event.handler.ts) (×5),
    [event-division](../../packages/application/src/commands/event-division.handler.ts) (×3),
    [team](../../packages/application/src/commands/team.handler.ts) (Register/Withdraw),
    [event-team-registration](../../packages/application/src/commands/event-team-registration.handler.ts) (×3),
    [bracket](../../packages/application/src/commands/bracket.handler.ts) (loader + ×6),
    [league-schedule](../../packages/application/src/commands/league-schedule.handler.ts) (loader + ×3),
    `GetEventByIdHandler` ([event-queries](../../packages/application/src/queries/event-queries.handler.ts)).
  - `EventReadModels`: `SearchEventsHandler`
    ([event-queries](../../packages/application/src/queries/event-queries.handler.ts)),
    `GetEventDetailHandler` ([event-detail](../../packages/application/src/queries/event-detail.handler.ts)).
  - `EventMembershipStore`: [co-host](../../packages/application/src/commands/co-host.handler.ts) (×2).
  - `EventWriteStore & EventMembershipStore`:
    [league-roster](../../packages/application/src/commands/league-roster.handler.ts).
- **No change** to infrastructure, the composition root, the web layer, or any
  test file.

## Patterns observed

- **ISP-splitting a god-port costs almost nothing when you keep a composed
  union for the adapter + tests.** The whole increment was an import rename +
  a constructor-type narrow per handler; the concrete adapter and the
  composition root never moved because the single instance satisfies every
  slice. This is the cheap, low-risk way to land an ISP win — worth reaching
  for before any adapter surgery.

## Follow-ups

Remaining on the roadmap's Phase 4 (tracked in
[architecture.md](../audits/architecture.md)):

- **P2-3 — decompose the 1,482-LOC `SupabaseEventRepository`.** Extract
  `getDetail` (~480 LOC) into per-concern, independently-testable loaders
  (`loadAttendees`, `loadTeamsWithPayments`, `loadFreeAgents`, `loadCoHosts`,
  `loadDivisions`, `computeViewerFlags`) under a sibling `event-detail/` folder;
  hoist the duplicated `rowToCapacity` / `divisionRowToCapacity` mappers. This
  is the adapter-side mirror of this increment and the natural inc. 2.
- **P2-6 — consolidate the event-detail read path** behind a single
  `GetEventDetailHandler` owning composition + caching, killing the
  `reviveEventDetailDates()` hack in
  [load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts).
- Optional: delete the composed `EventRepository` union once nothing depends on
  it (the test fakes can move to the slices) — a tidy-up, not load-bearing.

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(domain 267, application 42, web 55, infra 7; lint 0 errors, 3 pre-existing
warnings unrelated; build 8/8). No DB change.
