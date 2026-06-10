# Host dashboard Phase 2: act from the dashboard (2026-06-09)

## Context

Phase 1 ([…-bundle-host-dashboard.md](2026-06-09-bundle-host-dashboard.md))
shipped the `/host` home, but every action still bounced the host to
`/events/[id]/manage`. The user wanted the dashboard to be a place to **do** the
common per-event chores, not just navigate to them — "implementing things that
make the host's life easier to perform common tasks for an event."

This phase adds a **per-event quick-actions menu** to every dashboard row (the
events tables _and_ the "needs attention" list). Almost everything **reuses an
existing server action**; the one net-new capability is **"Host again"**
(duplicate), which prefills the new-event form from a past event.

## Decisions

- **`EventActionsMenu` is one client island fed only data**
  ([event-actions-menu.tsx](../../apps/web/src/app/host/_components/event-actions-menu.tsx))
  — a Radix `DropdownMenu` (same primitive as
  [nav-dropdown.tsx](../../apps/web/src/components/nav-dropdown.tsx)) over a `⋯`
  trigger. It takes only serializable props (`eventId`, `title`, `isUpcoming`,
  `isCancelled`, `attendeeCount`), so the **server-rendered** events tables and
  needs-attention list render it without tripping the "functions can't cross the
  RSC boundary" pitfall. The two dialogs (message / cancel) are rendered
  **outside** the Radix menu and driven by local `useState`, the standard
  menu→dialog handoff (closing the menu doesn't unmount the dialog).
- **Reuse, don't reinvent, the per-task server actions.** Message attendees →
  `sendEventBroadcast` (the existing broadcast action, now hosted in a dialog
  instead of the `<details>` of
  [host-broadcast-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/host-broadcast-panel.tsx));
  it `redirect()`s to the event page on success, which is fine for the dashboard
  (confirms it sent). Cancel → `cancelEventAction` via a thin
  `(eventId, reason)` adapter
  ([\_actions.ts](../../apps/web/src/app/host/_actions.ts)) so the
  [`ConfirmDialog`](../../apps/web/src/components/confirm-dialog.tsx)'s reason
  textarea wires straight through. Download roster → the existing
  `/api/events/[id]/attendees.csv` route. Copy link → `navigator.clipboard` +
  `useToast`.
- **Actions are gated to where they make sense.** Message/CSV only when there are
  attendees; Cancel only for upcoming, non-cancelled events; Cancel is always
  behind a destructive confirm dialog. `/host` is dynamic (cookie-scoped) so it
  re-renders fresh after a cancel redirect — no extra `revalidatePath('/host')`
  needed (the adapter notes this).
- **"Host again" hangs off the form's existing `templateValues` prefill** rather
  than a new draft-copy code path (events auto-publish on create —
  `create-event.handler.ts:179` — so a server-side clone would either publish a
  live event with a stale date or need a new draft path). The new-event page
  gains `?from=<eventId>`: it loads the source via `loadEventDetail` (RLS-scoped,
  **gated on `event.canManage`** so a host can only duplicate their _own_
  events), maps it with the pure
  [`buildDuplicatePrefill`](../../apps/web/src/app/events/new/_loaders/build-duplicate-prefill.ts),
  and passes the result as `templateValues`. A `loadEventDetail` that `notFound()`s
  on an unknown/invisible `from` is caught and degraded to a blank form rather
  than 404-ing the create page.
- **Duplicate carries descriptive fields only — never date or pricing.** Date is
  omitted on purpose (the host picks a new one — the point of duplicating);
  pricing/fee flags are omitted because they're Stripe-sensitive and a stale
  price silently riding along is the kind of bug worth designing out (Phase 2
  scope). Primary-division skill + fixed capacity carry over; unlimited /
  by-position fall back to the form default. Unit-tested
  ([build-duplicate-prefill.test.ts](../../apps/web/src/app/events/new/_loaders/build-duplicate-prefill.test.ts)).

## Files

New: `event-actions-menu.tsx` (client island), `host/_actions.ts` (cancel
adapter), `events/new/_loaders/build-duplicate-prefill.ts` (+ test). Modified:
`host-events-table.tsx` + `needs-attention.tsx` (render the menu; the table
gained an `upcoming` flag to gate the menu), `host/page.tsx` (pass `upcoming`),
`host/_loaders/aggregate.ts` (`AttentionItem` gained `attendeeCount` so the menu
can gate message/CSV), `events/new/page.tsx` (`?from=` prefill + banner).

## Verification

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green (375 web
tests, +6 for `buildDuplicatePrefill`). **Not yet visually verified in a running
app** — manual dev-server check still owed: open a row's `⋯` menu, exercise each
action (Message sends + recipient gets the ping; Copy toasts; Download returns
the CSV; Host again lands on `/events/new` prefilled with an empty date + the
"Duplicating…" banner; Cancel confirms → refunds/notifies → event page). Verify
the menu + dialogs in light **and** dark, and that Message/Cancel hide when not
applicable.

## Follow-ups (deferred)

- Prefill pricing/divisions/roster into "Host again" once a safe, Stripe-aware
  mapping exists.
- Bulk actions across multiple events; per-event drilldown analytics; payout
  reconciliation.
