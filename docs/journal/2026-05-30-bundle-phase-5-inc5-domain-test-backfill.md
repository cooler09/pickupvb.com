# Phase 5 inc. 5 — domain test backfill, last testable units (P3-4 resolved) (2026-05-30)

## Context

Fifth Phase 5 increment (opportunistic). Closes **P3-4** (thin domain test
coverage for newer units — [architecture.md](../audits/architecture.md)). Phase
5 inc. 2 covered the two audit-named priorities (`standings`,
`community-listing`) and deferred the rest of the list: `division`,
`events/location`, `payments/host-stripe-account`, `payments/host-subscription`.
This increment finishes that list.

Picked this (my choice) as the safe, high-compounding next step among the
remaining Phase 5 items: it changes **zero production code**, and the other open
items each carry risk or need a decision — P3-1's remainder lifts live form
state behind a context (behaviour-sensitive), P3-2's remainder reroutes the live
Stripe charge write path (wants characterization tests first), and P3-3 is a
"pick one" product call (add `application` handlers vs. document the facades).
Backfilling pure-unit tests is the one item that needs neither.

## Decisions

- **Only two of the four deferred units are actually testable.** On reading them:
  - `events/division` — a value-shaped entity with a rich `create()` carrying
    ~10 invariants. Genuinely worth testing.
  - `events/location` — a value object with lat/long range + required-field
    guards + trimming. Worth testing.
  - `payments/host-stripe-account` and `payments/host-subscription` — **pure
    type aliases + a repository `interface`, no logic.** They're the
    Stripe-shaped read models and their DDD ports; every behaviour lives in the
    infra adapter (an integration seam), not in a pure unit. Per AGENTS.md "skip
    the test when the change is a pure type tweak," there is nothing to
    unit-test. Writing hollow "the type has these fields" tests would be the
    noise the testing guide warns against.

  So P3-4 is **closed, not just advanced**: every domain unit with invariant
  logic is now covered, and the two leftovers are correctly out of scope.

- **Pinned behaviour at the boundaries, not the happy path only.** Each guard
  gets both a rejecting case and (where there's a boundary) an accepting
  boundary case — e.g. label at exactly 60 chars passes / 61 throws; latitude
  ±90 and longitude ±180 pass / just-past throws. Test names read like the rule.
- **`fromPersistence` proves it's a no-validation path.** The division persistence
  test deliberately feeds values `create()` would reject (empty label, negative
  sortOrder, indoor+triples) and asserts they round-trip — documenting that
  rehydration trusts already-validated rows (the ADR 0019 pattern).
- **Per-file fixture factory, no shared helper.** Local `props(overrides)` in
  each file (matches the repo's existing per-file fixture style, e.g.
  `event-team-registration.test.ts`). `location.test.ts` derives its override
  type from `Parameters<typeof Location.create>[0]` so the fixture can't drift
  from the constructor signature.

## Changes

- **Domain (tests only):**
  - [events/division.test.ts](../../packages/domain/src/events/division.test.ts)
    (33) — label trim/required/≤60 + boundary; sortOrder non-negative-integer;
    surface×format compatibility (indoor rejects triples, accepts sixes);
    documented defaults (Adult / Solo / PerPlayer / allowFreeAgents=true /
    null overrides); tierLabel trim/null-coerce/≤40; teamSize range +
    required-for-Partners/PairDraw; priceCents range incl. free + over-cap;
    prize text trim/≤500 + purse non-negative-integer; `endsAt > startsAt`
    schedule window + one-sided window; capacity/registration-mode passthrough;
    `fromPersistence` no-validation round-trip.
  - [events/location.test.ts](../../packages/domain/src/events/location.test.ts)
    (10) — valid construct + trim of all string fields; latitude ±90 bounds +
    boundary; longitude ±180 bounds + boundary; required city/country reject
    blank; blank address/region/postal allowed.
  - (+43 domain tests, 307 → 350.)
- **No production code touched.**

## Patterns observed

- **"Untested" in an audit list isn't always "has a missing test."** Two of the
  four named units were pure ports/types — the right move was to document _why_
  they need no test (closing the finding) rather than manufacture coverage. A
  test-backfill pass should triage logic-bearing units from type-only ones
  first; the latter are already covered by `tsc`.
- **Pure value objects / value-shaped entities are the cheapest high-value
  coverage.** 43 cases run in ~10ms, no mocks, no I/O — and they pin the exact
  boundaries (`>` vs `>=`, trim-then-check) that are easiest to regress silently
  in a future refactor.

## Follow-ups

- **P3-1 remainder** — lift `NewEventForm`'s inline section JSX behind a
  form-state context (ADR 0005 ~200-LOC target) and have `edit-event-form.tsx`
  consume the shared `_components/` pieces (DRY). Behaviour-sensitive; exercise
  the create/edit flows.
- **P3-2 remainder** — route the checkout/charge handlers' inline
  `admin.from(...)` attendee/tip/sponsor writes through the payment repos. Wants
  characterization tests on the webhook first (the live charge write path).
- **P3-3** — payment-handler decision (add `application` handlers for
  `HostStripeAccount` / `HostSubscription`, or document the `lib/` facades as a
  sanctioned read-projection shortcut in AGENTS.md). A product/architecture call.

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(domain **350** (was 307), application 47, web 55, infra 23; lint 0 errors,
pre-existing warnings only; build 8/8). No DB change.
