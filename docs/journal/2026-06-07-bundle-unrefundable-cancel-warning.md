# Paid self-cancel warns when no online refund is possible (2026-06-07)

## Context

A paid open-play attendee always saw a **"Cancel sign-up & refund"** button
([paid-ticket-panel.tsx](../../apps/web/src/app/events/[id]/_components/paid-ticket-panel.tsx)).
Clicking it runs `leaveEvent` → `refundAttendeeTicket`. But when there is no
online charge to reverse, the refund silently does nothing useful:
`refundAttendeeTicket` returns `not_paid` and `leaveEvent` **falls through to the
plain `LeaveEventCommand` path and flashes `?rsvp=left` ("success")**
([rsvp-actions.ts#L123-L133](../../apps/web/src/app/events/[id]/rsvp-actions.ts#L123-L133)).
The attendee is removed, gets no money back, and sees **no error**. This bites
three knowable-at-render situations: the attendee was marked paid **off-platform**
(no `payment_intent_id`), the host's Connect account is **no longer
charges/refunds-enabled** (`hostStripeReady` false), or it's **past the refund
window**. The maintainer asked: disable the refund affordance when we can't
actually refund and show a user-friendly message instead.

## Decisions

- **Gate at render time, mirroring the runtime gate — don't rely on the click to
  fail.** New pure helper
  [`refundBlockReason`](../../apps/web/src/lib/refund-eligibility.ts) returns
  `'off_platform' | 'host_not_ready' | 'window_closed' | null` from
  `{ paymentStatus, viaStripe, hostStripeReady, startsAtMs, refundWindowHours,
nowMs }`. The window math is kept **identical** to the server's
  `assertWithinRefundWindow` (`cutoff = startsAt − windowMs`, blocked when
  `now > cutoff`) so the UI never offers a refund the server would then refuse.
  Pure + no `server-only` so it unit-tests cleanly.
- **Keep self-cancel available, but warn — don't hard-disable** (maintainer's
  call). When blocked, the button becomes **"Cancel sign-up (no refund)"** with a
  reason-specific amber warning and a confirm dialog that spells out "No refund
  will be issued."
- **The "(no refund)" button must actually leave — give it its own action.** The
  render gate created a mismatch: a paid-online attendee who's blocked by
  `host_not_ready` / `window_closed` has a `payment_intent_id`, so the normal
  `leaveEvent` would _attempt_ a Stripe refund, fail/refuse, and keep them signed
  up — directly contradicting the button label. Fix: a separate
  **`leaveEventNoRefund`** server action that skips `refundAttendeeTicket`
  entirely and goes straight to `LeaveEventCommand` (shared `plainLeave` helper).
  It needs to be a _distinct_ exported action, not a `skipRefund` boolean arg,
  because `<form action>` appends `FormData` as the trailing positional arg — a
  second positional `skipRefund` would receive the truthy FormData on the refund
  form and wrongly skip. The host can still refund out-of-band from their Stripe
  dashboard (the PI survives), which is what the warning copy tells the attendee.
- **Friendly copy for the runtime refund-failure paths too.** `leaveEvent` no
  longer echoes the raw Stripe error: `failed` → `?rsvp=refund_failed` ("we
  couldn't process your refund automatically — your spot is still reserved,
  message the host"), `window_closed` (race: window shut between render and
  click) → `?rsvp=refund_window_closed` (kept their spot, point them at the
  host). Neither forfeits the spot, since on these paths the attendee expected a
  refund and didn't consent to "no refund."
- **Reason-specific copy via M3 `warning` role tokens.** Three messages keyed off
  the block reason (`REFUND_BLOCK_COPY`), painted with
  `bg-md-warning-container` / `text-md-on-warning-container` (AGENTS pattern 17 —
  semantic surface, no `dark:` fork needed).
- **Surface `viaStripe` from the existing viewer-payment read.**
  `loadViewerPaymentStatus` already hit `event_participant_payments`; it now also
  selects `payment_intent_id` and returns `{ status, viaStripe }`. No new query —
  the eligibility check costs nothing extra. Computed in the loader where
  `hostStripeReady`, `nowMs`, `pricing`, and `event.startsAt` are all in scope.

## Changes

- `apps/web/src/lib/refund-eligibility.ts` (new) — `RefundBlockReason` +
  `refundBlockReason()` pure helper.
- `apps/web/src/lib/refund-eligibility.test.ts` (new) — 7 cases incl. the
  boundary (refund allowed _exactly at_ the cutoff, blocked 1ms past) and reason
  priority (`off_platform` wins over host/window).
- `apps/web/src/app/events/[id]/_loaders/load-event-detail.ts` —
  `loadViewerPaymentStatus` now returns `{ status, viaStripe }`; loader derives
  `refundBlockReason` and adds it to `EventDetailViewModel`.
- `apps/web/src/app/events/[id]/page.tsx` — thread `refundBlockReason` into
  `EventSignupArea`.
- `apps/web/src/app/events/[id]/_components/event-signup-area.tsx` — pass-through
  prop to `PaidTicketPanel`.
- `apps/web/src/app/events/[id]/_components/paid-ticket-panel.tsx` — conditional
  "& refund" (`leaveEvent`) vs "(no refund)" (`leaveEventNoRefund`) button +
  warning banner.
- `apps/web/src/app/events/[id]/rsvp-actions.ts` — extracted `plainLeave`, added
  `leaveEventNoRefund`, mapped `failed` → `refund_failed` and `window_closed` →
  `refund_window_closed` (was: raw Stripe message via `?rsvp=error`).
- `apps/web/src/lib/event-rsvp-flash.ts` — `refund_failed` +
  `refund_window_closed` banner copy.

## Patterns observed

- **A render-time gate must share its math with the runtime gate.** The cutoff
  formula now lives in two places (`refund-eligibility.ts` for the button,
  `refund-window.ts` for the Stripe call). The unit test pins the boundary so
  they can't silently drift; a follow-up could have the server import the pure
  helper to collapse them.

## Follow-ups

- **Verified:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all
  green (web tests 268→275).
- **e2e:** worth a dev case — mark an attendee paid off-platform, confirm the
  panel shows "Cancel sign-up (no refund)" + warning and the cancel removes them
  without a Stripe call; and force a `failed` refund to confirm the friendly
  `refund_failed` banner (not the raw Stripe string). Deploy-gated.
