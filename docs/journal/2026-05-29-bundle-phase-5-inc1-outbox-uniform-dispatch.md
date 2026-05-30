# Phase 5 inc. 1 — uniform analytics-outbox dispatch (P2-4) (2026-05-29)

## Context

First increment of the roadmap's **Phase 5** (opportunistic). Closes **P2-4**
([architecture.md](../audits/architecture.md)): the domain-event / analytics
outbox was half-wired. Aggregates raised events that no handler delivered —
`VolleyballEvent` raises publish/cancel/team/free-agent events and `Bracket`
raises generate/reset/complete/match-result events, but only
`SpotFilled`/`SpotReleased` were ever dispatched (and only from
`join-event.handler`). The trap: a reader sees `this.raise(new BracketCompleted(...))`
and assumes it's delivered somewhere. It isn't.

> **Decision (asked the user — this is a "pick one" finding with product
> implications):** chose **complete the seam (uniform dispatch)** over
> document-only or prune-the-events. The other two options were offered; the
> user picked making the mechanism real.

One audit detail was **stale**: it claimed `team.handler.ts#L146` drained
events via `pullEvents()` purely to discard. That call no longer exists — the
only `pullEvents()` caller is `dispatchAnalyticsOutbox`. Noted and not acted on.

## Decisions

- **Generalized the dispatcher to any aggregate.** `dispatchAnalyticsOutbox`
  now takes `AggregateRoot<unknown>` (was `VolleyballEvent`), so it drains and
  ships events for `VolleyballEvent`, `Bracket`, and any future raising
  aggregate without a signature change. It stays synchronous + fail-quiet
  per-event.
- **Generalized the mapper + added an `instanceof` guard.**
  `mapDomainEventToAnalytics(de, aggregate: AggregateRoot<unknown>)` narrows
  `de instanceof SpotFilled && aggregate instanceof VolleyballEvent` before
  reading the VolleyballEvent-only `eventScopedProps`. The narrow is the
  type-safe (and crash-safe) bridge from the generic aggregate the dispatcher
  hands it — without it, a Bracket flowing through would call
  `eventScopedProps(bracket)` and throw. Everything else still returns `null`
  (the documented fail-quiet path), so **no new analytics are captured** — the
  taxonomy is unchanged; the _seam_ is what changed.
- **Wired dispatch after `save()` in every handler that persists a raising
  aggregate** (`VolleyballEvent` + `Bracket`), threading an **optional**
  `analytics?: AnalyticsPort` so tests/call-sites without a port keep working
  and absence is a no-op:
  - VolleyballEvent: `CreateEvent`, `JoinEventAsFreeAgent` / `LeaveEventAsFreeAgent`
    (the 3 player join/leave handlers already dispatched), the 3
    `EventDivision` handlers, `RegisterTeam` / `WithdrawTeam`.
  - Bracket: all 6 in `bracket.handler` (Create/Seed/Generate/GeneratePlayoff/
    Reset/ReorderPool) + `RecordMatchResult` / `ResetMatch`.
  - Wired `analytics` through the composition root — the module-singleton
    `handlers` and the per-request `getMatchResultHandlers()` (the captain-RLS
    path keeps its user-scoped client; only the analytics arg was added).
  - **Deliberately included no-op raisers (event-division) for uniformity** —
    the guarantee is "every handler that saves a raising aggregate dispatches,"
    so a future `DivisionAdded`-style event is auto-delivered. Aggregates that
    raise nothing today (`Team`, `LeagueSchedule`, `EventTeamRegistration`,
    `CommunityListing`) were left alone — their handlers gain dispatch when/if
    they start raising.
- **No taxonomy expansion.** Whether to actually _capture_ publish/cancel/
  bracket events is a separate product call; this increment only makes delivery
  uniform so adding a capture is a one-line mapper change, live everywhere.
- **Tests (+5):** the mapper grew two `instanceof`-guard cases (SpotFilled +
  non-VolleyballEvent aggregate → null; Bracket event → null), and a new
  [dispatch-outbox.test.ts](../../packages/application/src/analytics/dispatch-outbox.test.ts)
  pins the generalization: captures a VolleyballEvent `event_joined`, drains a
  non-event aggregate fail-quiet (Bracket events flow through, capture nothing,
  buffer emptied), and swallows a throwing port. These fail against the old
  `VolleyballEvent`-only signature.

## Changes

- **Application** —
  [dispatch-outbox.ts](../../packages/application/src/analytics/dispatch-outbox.ts)
  (generic aggregate) +
  [event-analytics-mapper.ts](../../packages/application/src/analytics/event-analytics-mapper.ts)
  (generic + instanceof narrow). Wired dispatch into
  [create-event](../../packages/application/src/commands/create-event.handler.ts),
  [join-event](../../packages/application/src/commands/join-event.handler.ts) (FA pair),
  [event-division](../../packages/application/src/commands/event-division.handler.ts) (×3),
  [team](../../packages/application/src/commands/team.handler.ts) (register/withdraw),
  [bracket](../../packages/application/src/commands/bracket.handler.ts) (×8).
  New `dispatch-outbox.test.ts`; +2 mapper tests.
- **Web** — [handlers.ts](../../apps/web/src/lib/handlers.ts): passed `analytics`
  to the newly-dispatching handlers (singletons + `getMatchResultHandlers`).
- **No change** to the analytics taxonomy, the PostHog adapter, the domain
  aggregates, or any captured-event behaviour (the existing join/leave funnel
  is byte-for-byte the same).

## Patterns observed

- **"Uniform dispatch" = generic mechanism + a wiring convention, not a base
  class.** Threading an optional port through each saving handler + a shared
  `dispatchAnalyticsOutbox(agg, this.analytics)` after `save()` kept it
  framework-free and test-simple, without an invasive base-handler hierarchy.
- **Generalizing a typed helper to a supertype needs an `instanceof` re-narrow
  at the point that reads subtype state.** The mapper accepts `AggregateRoot`
  but reads `VolleyballEvent` props — the `instanceof` both satisfies the
  compiler and prevents a wrong-aggregate crash. Promoted the convention to
  AGENTS.md ("Patterns surfaced by audits").

## Follow-ups

- **Taxonomy expansion (product call, deferred):** to actually capture
  `event_published` / `event_cancelled` / bracket funnels, add the variant to
  `AnalyticsEvent` + a mapper branch — now a one-liner, delivered everywhere.
- Remaining Phase 5: P3-2 (Stripe webhook decomposition), P3-1 (new-event-form
  decomposition), P3-3 (payment-handler decision), P3-4 (domain test backfill).

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(domain 267, application **47** (was 42), web 55, infra 23; lint 0 errors,
pre-existing warnings only; build 8/8). No DB change.
