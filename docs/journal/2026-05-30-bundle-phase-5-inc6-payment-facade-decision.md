# Phase 5 inc. 6 — payment-facade decision (P3-3 resolved) (2026-05-30)

## Context

Sixth Phase 5 increment. Closes **P3-3** (architecture audit) — "Payment
aggregates bypass the application layer (CQRS bypass)." The finding was
explicitly a _decide-intentionally_ item: either (a) add `application`
command/query handlers for `HostStripeAccount` / `HostSubscription` for
consistency with the rest of the handler registry, or (b) document the existing
`lib/` facades as a sanctioned read-projection shortcut so the next agent
doesn't mistake them for drift.

Zachary picked this item to resolve. The remaining two Phase 5 items (P3-1 form
context, P3-2 webhook write-path) are both the explicitly-deferred
behaviour-sensitive halves; P3-3 is the one that just needed a justified call.

## Investigation

Before deciding, surveyed the actual shape rather than going on the finding's
framing:

- **Callsites.** [pro.ts](../../apps/web/src/lib/pro.ts) has 10 importers across
  pages, actions, CSV route handlers, and a webhook; the 7 functions are mostly
  reads (`isPro` ×12, `getHostSubscription`, `getHostStripeCustomerId`,
  `hostPaidEventCount30d`, `findHostByStripeCustomerId`) plus two
  webhook-driven writes (`seedHostStripeCustomer`, `upsertHostSubscriptionFromStripe`).
  [host-stripe-account.ts](../../apps/web/src/lib/host-stripe-account.ts) has 11
  importers; reads (`getHostStripeAccount` ×8, `getHostStripeAccountStatus` ×6,
  the composed `requireHostChargesEnabled` ×3) plus three Stripe-mirror writes
  (`create`, `updateStatusByHostId`, `mirrorStripeAccountUpdate`).
- **The "aggregates."** Both
  [host-stripe-account.ts](../../packages/domain/src/payments/host-stripe-account.ts)
  and [host-subscription.ts](../../packages/domain/src/payments/host-subscription.ts)
  are **pure `type` aliases + a repository `interface`** — no class, no factory,
  no invariant, no state machine. (This is the same observation that closed
  their P3-4 slice in inc. 5: nothing to unit-test because there's no behaviour.)
- **The facades themselves** are thin pass-throughs to `repositories.*`, with
  the only logic being a null-on-`!chargesEnabled` guard and the
  `requireHostChargesEnabled` message — both presentational/read-shaped.

## Decision — option (b)

**Kept the facade-over-port shape as a sanctioned convention.** A command/query
handler layer here would be pure ceremony with zero behaviour, for four concrete
reasons:

1. **No invariants to enforce.** A handler's job is to load an aggregate, call a
   rule, and save. These types have no rule — a handler would be
   `repo.method(args)` verbatim.
2. **The reads are CQRS read projections** (often backed by a Postgres function
   — `is_pro_host`, `host_paid_event_count_30d`), exactly the "trivial
   viewer/host-scoped read" the throughput playbook reserves for direct port
   access.
3. **`isPro` cannot move inward.** It's wrapped in `React.cache` for
   per-request dedup across event-detail side-loads (performance audit P3 #12),
   and `react` is purity-banned from `@pickupvb/application` by the Phase 0
   ratchet. The memoized read _must_ keep a web-layer wrapper regardless.
4. **The writes are session-less Stripe mirrors.** `seedCustomer` /
   `upsertFromStripe` / `create` / `updateStatusBy*` run from the
   `lib/webhooks/*` handlers on the admin client — there's no authenticated user
   and no RLS to enforce, so a command handler adds no authorization value.

Wrapping these in handlers would be the "partial pattern that misleads" the
playbook (item 4) warns against — it would imply an aggregate-mutation seam that
isn't there. Option (a) is the wrong kind of consistency.

**Documented the convention** as AGENTS.md "Patterns surfaced by audits"
**item #10**, including the explicit **re-open trigger**: the moment either type
grows a real invariant or a multi-step state transition (an enforced
subscription lifecycle, proration, a cross-aggregate guard), promote that rule
into the domain and add a command handler for the mutation. Until then the
facade is the sanctioned shape — so a future reader sees a deliberate decision,
not an oversight.

## Changes

- [AGENTS.md](../../AGENTS.md) — new "Patterns surfaced by audits" item #10
  ("Payment state is a sanctioned facade-over-port shortcut — not a CQRS gap"),
  with the four-reason rationale and the re-open trigger.
- [architecture.md](../audits/architecture.md) — P3-3 flipped to ✅ Resolved with
  the decision rationale; status block added at the top.
- [audits/README.md](../audits/README.md) — index row updated.
- **No production code touched. No DB change.**

## Patterns observed

- **"CQRS bypass" isn't automatically a defect — grade by whether the bypassed
  layer would enforce anything.** When the underlying type has no invariant, the
  handler is the noise, not the facade. The right resolution to a
  "consistency" finding can be to _document why the inconsistency is correct_,
  not to manufacture uniformity.
- **A purity ratchet shapes architecture decisions downstream.** Because `react`
  is banned from `application`, the `React.cache`-memoized read settles the
  "where does `isPro` live" question on its own — the ratchet from Phase 0 is
  still paying off by removing a degree of freedom.

## Follow-ups

Remaining Phase 5 — both behaviour-sensitive, both explicitly deferred earlier:

- **P3-1 remainder** — lift `NewEventForm`'s ~660-LOC inline section JSX behind
  a form-state context (ADR 0005 ~200-LOC target); have `edit-event-form.tsx`
  consume the shared `_components/` pieces (DRY). Wants the create/edit flows
  exercised.
- **P3-2 remainder** — route the checkout/charge webhook handlers' inline
  `admin.from(...)` attendee/tip/sponsor writes through the payment repos.
  Touches the live charge write path; **write characterization tests first**.

With P3-3 + P3-4 closed, the only open architecture findings are these two
deferred halves.

## Verify

No code change, so the prior inc. 5 quad still stands: `pnpm typecheck && pnpm
lint && pnpm test && pnpm build` green (domain **350**, application 47, web 55,
infra 23; lint 0 errors, pre-existing warnings only; build 8/8). No DB change.
