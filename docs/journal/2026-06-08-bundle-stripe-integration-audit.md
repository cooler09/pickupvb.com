# 2026-06-08 — Stripe integration audit + remediation (SI-1…SI-7)

## Context

User asked for an audit of the Stripe integration end-to-end (bugs, gaps,
improvements, stale code). No existing audit file is a code-quality review of
the payments path — [monetization.md](../audits/monetization.md) is strategy,
[third-party-integrations.md](../audits/third-party-integrations.md) is the
cost/ToS lens (TPI-4/5/6 already cover the API-version pin, the checkout
idempotency key, and webhook dedup) — so a new
[stripe-integration.md](../audits/stripe-integration.md) was created. The audit
found **no P1s**, 2 P2, 5 P3; all were fixed in the same session. Quad-green,
uncommitted.

## Decisions

- **SI-1 — `payment_intent.payment_failed` made an honest no-op, not "fixed."**
  The handler called `deletePendingAttendeesByPaymentIntent` /
  `markPendingTipsFailedByPaymentIntent`, which key on the PI — but a pending row
  only ever stores its `checkout_session_id` (the PI is written at completion),
  so they matched **zero rows**: dead code. The obvious "fix" (resolve PI→session,
  eager-release) is **worse than the bug**: this event fires while the Checkout
  Session is still `open`, so the buyer can retry and complete on that same
  session — eager release deletes the seat the later
  `checkout.session.completed` flips to `paid` (charged, holds nothing). Chose to
  delete the dead methods and document that `checkout.session.expired` + the
  cancel route are the authoritative, safe release paths. The 30-min held seat on
  a silent abandon is **by design** (`expires_at`), not a defect.
- **SI-3 — notify the host on dispute, do NOT auto-free the seat.** The audit
  floated "free it, mirroring `charge.refunded`." Rejected: a dispute can be won
  (funds returned), so deleting the buyer pre-emptively is the wrong default.
  Notifying the host (the half that was actually dark) lets them decide. Same
  principle as SI-1 — don't act irreversibly on a non-final state.
- **SI-3 — host-notify scoped to tickets + tips.** Team-payment disputes route
  through separate aggregates and Stripe already emails the Connect host
  directly, so in-app parity for them is a deferred one-method follow-up, not a
  gap that goes dark.
- **SI-4 — idempotency keys yes, success-reconcile no.** Sponsor keys fold in a
  sha256 of the draft (a stable key with a changed body trips Stripe's "same key,
  different body" error); badge keys are stable (no per-attempt draft). The
  synchronous success reconcile was deferred — the completion webhook already
  evicts the event cache and the edit page reads the slot fresh, so only
  `stripe listen`-less local dev sees a lag.
- **SI-7 — expose `applicationFeeCents` rather than reuse `platformFeeCents`.**
  The ticket checkout computed the platform fee twice. Couldn't just reuse
  `breakdown.platformFeeCents` (it's 0 when the host absorbs the fee), so the
  breakdown now returns a separate `applicationFeeCents` = the platform's cut
  independent of the absorb toggle. That's the value Stripe's
  `application_fee_amount` always wants.

## Changes

**P2**

- [charge.ts](../../apps/web/src/lib/webhooks/charge.ts) — `handlePaymentFailed`
  → documented no-op; new `handleChargeDisputed`.
- [event-payment-repository.ts](../../packages/domain/src/events/event-payment-repository.ts)
  - [adapter](../../packages/infrastructure/src/supabase-event-payment-repository.ts)
    — removed the two dead by-PI methods; added `findTipContextByPaymentIntent`.
- Cache eviction (`updateTag(eventCacheTag) + revalidatePath`, guarded) added to
  the [attendee](../../apps/web/src/app/events/[id]/checkout/success/route.ts),
  [team](../../apps/web/src/app/events/[id]/team-checkout/success/route.ts), and
  [roster](../../apps/web/src/app/events/[id]/roster-team-checkout/success/route.ts)
  success routes + the [attendee cancel](../../apps/web/src/app/events/[id]/checkout/cancel/route.ts)
  route.

**P3**

- New `host.payment.disputed` notification kind across
  [kinds.ts](../../packages/notifications/src/kinds.ts) +
  [templates.ts](../../packages/notifications/src/templates.ts) (email/sms/in-app);
  `charge.dispute.created` dispatch case in
  [webhook route](../../apps/web/src/app/api/webhooks/stripe/route.ts).
- Idempotency keys in
  [sponsor-actions.ts](../../apps/web/src/app/events/[id]/edit/sponsor-actions.ts)
  (draft-hash) and [badge-actions.ts](../../apps/web/src/app/events/[id]/edit/badge-actions.ts)
  (stable).
- [pro/actions.ts](../../apps/web/src/app/profile/billing/pro/actions.ts) — stale
  `invoice.*` comment corrected.
- [event-pricing.ts](../../apps/web/src/lib/event-pricing.ts) —
  `paymentsOffPlatform` on `EventPricing`; breakdown short-circuit + new
  `applicationFeeCents`. [checkout-actions.ts](../../apps/web/src/app/events/[id]/checkout-actions.ts)
  — `off_platform` guard + reuse of `applicationFeeCents`.
- [refund-window.ts](../../apps/web/src/lib/refund-window.ts) — Prettier 2-space.
- Tests: rewired `charge.test.ts` (safe-no-op + 3 dispute cases); dropped the
  payment-failed adapter test block.

## Patterns observed

- **"Match by X" cleanup handlers are only as good as whether X is populated when
  they run.** The payment-failed handler keyed on a column (`payment_intent_id`)
  that is null for the exact rows it targets. A green typecheck/test suite hid it
  because the handler "ran" — it just matched nothing. When writing a webhook
  cleanup, trace whether the join key exists _at that point in the lifecycle_,
  not just in the schema.
- **Reconcile routes are mutations too.** The success/cancel routes flip payment
  state but predated the webhook's cache-eviction discipline (AGENTS.md pattern
  #1). Any handler that writes payment state and the page reads from a tagged
  `unstable_cache` must `updateTag` — webhook _or_ redirect.
- **Don't act irreversibly on a non-final Stripe state.** Both SI-1 (open,
  retryable session) and SI-3 (winnable dispute) tempted an eager delete that the
  later terminal event would contradict. The safe move is wait-for-terminal +
  notify.

## Follow-ups

Deferred, tracked in
[stripe-integration.md](../audits/stripe-integration.md) remediation log:

- **Team-payment dispute host-notify** — `findEventContextByPaymentIntent` over
  the team-payment surfaces, then route through `handleChargeDisputed`. Rare;
  Stripe emails the host directly meanwhile.
- **Sponsor/badge success-route reconcile** — only matters for
  `stripe listen`-less local dev; the webhook covers prod.

## Verification

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green (298 web tests
— +3 dispute cases; lint clean apart from the pre-existing scoreboard
theme-toggle warnings). No e2e run — the dispute path needs a Stripe-emitted
`charge.dispute.created`, which the persona suites don't exercise.
