# Phase 5 inc. 2 — domain test backfill (P3-4) (2026-05-29)

## Context

Second Phase 5 increment (opportunistic). Chips at **P3-4** (thin domain test
coverage for newer units — [architecture.md](../audits/architecture.md)). The
audit named the priority order: "prioritize `standings` (scoring math) and
`community-listing` (claim/approve state machine)." Both were entirely untested,
as were the pure `determineWinner` match-decision helper and the `ExternalUrl`
value object — all pure, all easy to pin, all touched whenever brackets /
listings change.

Picked this (my choice) as the safe, high-compounding next step: it changes
**zero production code**, locks in behaviour so the riskier Phase-5 items
(notably the P3-2 Stripe-webhook teardown) can be done against a green suite,
and needs no product decision.

## Decisions

- **Covered the two audit-named priorities + two cheap adjacent wins.** New
  files: `brackets/standings.test.ts`, `brackets/match.test.ts`
  (`determineWinner` lives in `match.ts`), `community-listings/community-listing.test.ts`,
  `community-listings/external-url.test.ts`. (+40 domain tests, 267 → 307.)
- **Pinned behaviour, not implementation.** Tests assert observable rules — the
  standings tally + the three-key tiebreak sort (wins → setDiff → pointDiff),
  best-of-N "majority clinches / null until then / tie is invalid", the listing
  state machine's legal transitions _and_ the guards that reject illegal ones
  (claim while pending/claimed/hidden/removed; hide/remove a claimed listing;
  update mid-claim), and `ExternalUrl`'s https-only / absolute / blocked-host
  rules. Test names read like the rule so a failure says _what_ broke.
- **Co-located one fixture per file, no shared test-helper module.** A local
  `match(...)` / `createProps(...)` factory in each file keeps the cases
  self-contained (matches the repo's existing per-file fixture style, e.g.
  `event-analytics-mapper.test.ts`).
- **Deferred the rest of P3-4's untested list** — `division`,
  `payments/host-stripe-account`, `payments/host-subscription`, `events/location`.
  Lower-priority per the audit; backfill as those units are next touched (the
  AGENTS.md "add a test when adding a domain rule" cadence).

## Changes

- **Domain (tests only):**
  - [brackets/standings.test.ts](../../packages/domain/src/brackets/standings.test.ts)
    (8) — `computePoolStandings` tally + pool filter + incomplete-registers-zero
    - missing-participant skip + tiebreak ordering; `distinctPools`.
  - [brackets/match.test.ts](../../packages/domain/src/brackets/match.test.ts)
    (7) — `determineWinner` best-of-1/3/5, null-until-clinched, early majority,
    tied-set-invalid, null ids / empty sets.
  - [community-listings/community-listing.test.ts](../../packages/domain/src/community-listings/community-listing.test.ts)
    (18) — create invariants (title length, time order, location normalize +
    lat/lng range) and the full claim/approve/reject + hide/unhide/remove/update
    state machine incl. every `ConflictError` guard.
  - [community-listings/external-url.test.ts](../../packages/domain/src/community-listings/external-url.test.ts)
    (7) — https-only, absolute-URL, blocked-host (case-insensitive),
    `fromPersistence` bypass.
- **No production code touched.**

## Patterns observed

- **Pure domain functions / aggregates are the cheapest high-value coverage.**
  No mocks, no I/O — the entire claim state machine is exercised in-memory in
  4ms. When an audit flags "thin coverage," the pure units (scoring math, value
  objects, state machines) are where a test-backfill pass pays back fastest.

## Follow-ups

- Remaining P3-4 units (`division`, payments aggregates, `events/location`) —
  backfill opportunistically.
- Remaining Phase 5: P3-2 (Stripe webhook decomposition — now safer with the
  green domain suite, though it needs its own characterization coverage), P3-1
  (new-event-form decomposition), P3-3 (payment-handler decision — a "pick one"
  like P2-4).

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(domain **307** (was 267), application 47, web 55, infra 23; lint 0 errors,
pre-existing warnings only; build 8/8). No DB change.
