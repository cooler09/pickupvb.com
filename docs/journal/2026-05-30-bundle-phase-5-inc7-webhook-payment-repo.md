# Phase 5 inc. 7 — webhook payment writes behind a port (P3-2 resolved) (2026-05-30)

## Context

Seventh Phase 5 increment. Closes the **behavioural half of P3-2** — the half
[inc. 4](2026-05-30-bundle-phase-5-inc4-stripe-webhook-decomposition.md)
deliberately deferred. inc. 4 relocated the seven Stripe-webhook handlers out of
the 833-LOC `route.ts` into cohesive `lib/webhooks/*` modules **verbatim**, but
left the individual (non-team) payment reconciliation writing rows via inline
`admin.from(...)` calls inside `checkout.ts` and `charge.ts`. The audit flagged
that routing those through a repository **changes the live charge-write path**
and therefore **needs characterization tests first**.

Zachary picked P3-2 next, explicitly accepting it as the higher-risk
(live-money) item. This increment does it test-first.

## What moved

The inline `admin.from(...)` operations across the two handlers, all reconciling
**individual** event payments (the team branches were already mediated through
the `EventTeamRegistration` / `EventTeamPayment` aggregates — untouched):

- `checkout.session.completed` — attendee payment mark-paid (by
  `checkout_session_id`), payment-audit insert, tip mark-paid, sponsor-slot
  upsert, host-id lookup.
- `checkout.session.expired` — pending-attendee delete (by session), pending-tip
  delete.
- `payment_intent.payment_failed` — pending-attendee batch delete (by PI),
  pending-tip → failed.
- `charge.refunded` — tip → refunded, refundable-attendee lookup, attendee
  delete, refund audit insert, event-title lookup (for the notify).

## Decisions

- **A port, not an aggregate.** These sidecar rows (`event_participant_payments`,
  `event_tips`, `event_sponsors`, `event_payment_audit`, the gated
  `event_participants` delete) carry **no domain invariants** — they're a flat
  reconciliation of Stripe state. So the new
  [`EventPaymentRepository`](../../packages/domain/src/events/event-payment-repository.ts)
  is a CRUD-shaped contract, not a load/mutate/save aggregate. This is the same
  judgement that resolved **P3-3** the right way (inc. 6): payment state with no
  invariant doesn't earn an aggregate/handler layer. The adapter
  ([SupabaseEventPaymentRepository](../../packages/infrastructure/src/supabase-event-payment-repository.ts))
  runs on the service-role admin client — the sanctioned session-less webhook
  context (AGENTS.md pitfall #8: no user, no RLS to enforce, so no auth value in
  a user-scoped client here).
- **Characterization-tests-first, honoured literally.** The risk on a money path
  is a silently-wrong column/filter in the relocation. So:
  1. The **adapter test** (`supabase-event-payment-repository.test.ts`, 18 cases)
     asserts the exact `{ table, op, filters, payload, opts }` for every method —
     and its assertions were written **from the original handler queries**, not
     from my adapter. If the verbatim copy drifted, the adapter would disagree
     with the test. (Hand-rolled chainable Supabase mock injected via the
     adapter constructor; the infra suite had no client-double precedent, so the
     mock is local to the file.)
  2. The **handler orchestration tests** (`checkout.test.ts` 17 +
     `charge.test.ts` 7) mock the repo port and pin what the handler now owns:
     branch selection by `metadata.kind`, arg mapping, the `analytics.capture`
     (ticket/tip/team/sponsor kinds + distinct-id) and `notify` dispatch, and
     every guard — the session/customer `user_id` mismatch **throw**, the
     missing-PI team skips (`log.warn` + return), the blank-sponsor no-op, the
     no-payment-intent refund short-circuit, the `amount_refunded ?? amountPaid`
     and `title ?? 'event'` fallbacks, and the best-effort notify swallow.
- **Clock stays in the handler.** `paidAt` / `refundedAt` are computed in the
  handler (`new Date().toISOString()`) and passed into the repo, so the adapter
  is pure and the timestamps are assertable — the repo never reads the clock.
- **Verbatim parity, then thin the handler.** The query bodies are byte-identical
  to inc. 4's (same `as never` payload casts, same `!inner` join string, same
  `onConflict: 'event_id'`); only their _home_ changed. `checkout.ts` /
  `charge.ts` are now pure orchestration with **zero raw `supabase`/`admin`
  references** (297→268 / 120→81 LOC).

## Changes

- **Domain:** new port
  [events/event-payment-repository.ts](../../packages/domain/src/events/event-payment-repository.ts)
  (`EventPaymentRepository` + `RefundableAttendee` / `PaymentAuditEntry` /
  `PaidSponsorSlot` DTOs); exported from `events/index.ts`.
- **Infrastructure:** new adapter
  [supabase-event-payment-repository.ts](../../packages/infrastructure/src/supabase-event-payment-repository.ts)
  (queries relocated verbatim) + `supabase-event-payment-repository.test.ts`
  (18). Exported from `index.ts`.
- **Web:**
  - [handlers.ts](../../apps/web/src/lib/handlers.ts) — construct + register
    `eventPaymentRepo` in `repositories`.
  - [webhooks/checkout.ts](../../apps/web/src/lib/webhooks/checkout.ts) +
    [webhooks/charge.ts](../../apps/web/src/lib/webhooks/charge.ts) — inline
    writes replaced with `repositories.eventPaymentRepo.*`; `getAdminSupabase`
    import dropped; `lookupHostId` now delegates to `findEventHostId`.
  - New `webhooks/checkout.test.ts` (17) + `webhooks/charge.test.ts` (7).
- **+42 tests** (infra 23→41, web 55→79). No production aggregate/DB change.

## Patterns observed

- **Characterization at the boundary that owns the detail.** Splitting the test
  surface — adapter test owns "which table/column," handler test owns "which
  branch + which side-effect" — keeps each test honest about its unit (AGENTS.md
  "mock at module boundaries"). The adapter test doubles as the parity proof for
  a verbatim relocation; the handler test is the regression net for the logic.
- **"No invariant" keeps recurring as the deciding question.** P3-3 said payment
  _facades_ need no handler; P3-2 says payment _writes_ need a port but no
  aggregate. Both fall out of the same observation — Stripe-mirrored rows have no
  state machine to protect — so the architecture stays a thin port, not ceremony.

## Follow-ups

- **P3-1 remainder** is now the **only** open architecture / Phase 5 item: lift
  `NewEventForm`'s ~660-LOC inline section JSX behind a form-state context (ADR
  0005 ~200-LOC target) and have `edit-event-form.tsx` consume the shared
  `_components/` pieces (DRY). Behaviour-sensitive; exercise the create/edit flows.
- The `EventPaymentRepository` is intentionally narrow (webhook reconciliation).
  If a future non-webhook caller needs one of these reads, widen the port rather
  than reintroducing an inline `admin.from(...)`.

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(domain 350, application 47, **web 79** (was 55), **infra 41** (was 23); lint 0
errors, pre-existing warnings only; build 8/8). No DB change. E2E not run (not in
the default chain; no covered journey changed — the webhook path has no e2e).
