# 2026-06-08 — Receipts & tax audit + ledger-completeness fix (R-1…R-3, R-11)

## Context

User asked for an audit of the Receipts and tax surface (bugs, gaps,
improvements, stale code). No existing audit file covered it —
[monetization.md](../audits/monetization.md) is strategy,
[stripe-integration.md](../audits/stripe-integration.md) is the webhook-path
code review — so a new [receipts-tax.md](../audits/receipts-tax.md) was created
(1 P1 · 3 P2 · 8 P3). This bundle fixed R-1 (P1), R-2 + R-3 (P2), and R-11 (P3
copy), with partial R-4/R-7. Quad-green, uncommitted; the migration is
deploy-gated.

The whole surface (buyer receipts, host earnings, the two annual CSVs, the GDPR
export) reads from **one** ledger table, `event_payment_audit`. The audit's
through-line: that table was only ever **half-populated**, and the host read
leaned on RLS instead of filtering.

## Decisions

- **R-1 — the ledger only recorded attendee tickets; teams + tips were
  invisible.** `recordPaymentAudit` was called only in the `kind === 'attendee'`
  checkout branch. So a tournament host whose revenue is team entry fees saw an
  **empty** earnings page and an empty "good for taxes" CSV, and a captain who
  paid a $200 team fee got **no** receipt. Fixed by recording an audit row for
  the **tip** and **team** (ad-hoc + roster) paid/refund paths, tagged with a
  new `event_payment_audit.category`.
  - **Why a `category` column rather than just recording everything:** the host
    earnings read is scoped by `events.host_id`, so without a category it can't
    tell a host-payout row (ticket/tip/team) from platform revenue
    (`sponsor_slot` / `badge_slot`, which sit on the host's event but are
    PickupVB income / a host add-on, not host payout). The earnings reads now
    filter `category in ('ticket','tip','team')`; buyer receipts stay
    user-scoped and show everything.
  - **sponsor_slot / badge_slot deliberately NOT recorded.** They're
    income-vs-expense ambiguous (a host buying a badge unlock for their own
    event is an _expense_, not earnings). The CHECK constraint lists them for
    forward-compat, but nothing writes them and the earnings allow-list excludes
    them — so wiring them later is a one-line decision, not a migration.
  - **Refund symmetry was mandatory, not optional.** Recording only the paid
    side would have _introduced_ a worse bug than the original: a refunded team
    fee would show as permanent full income (today it's invisible, i.e. $0).
    So all four team paths (ad-hoc/roster × paid/refund) and the tip-refund path
    record matching rows. `markTipsRefundedByPaymentIntent` was changed to
    return the refunded tip's audit context (and guarded on `status='paid'` so a
    webhook retry is a no-op — no duplicate `refunded` row).
  - **Idempotency rides the existing aggregate guards.** The team mediators
    already early-return when the aggregate is already Paid (paid path) or not
    Paid (refund path), so the audit write lands exactly once per transition on
    a Stripe retry — no new dedupe needed.
  - **Backfill through the real storage path.** Both ad-hoc and roster team
    payments live in `event_team_payments` (keyed `entry_id` → `event_team_entries`
    → `event_divisions.event_id`); the migration backfills paid + refunded tips
    and team fees, idempotent on `payment_intent_id`. `event_team_payments` has
    no `refunded_at`, so refund rows are stamped at `updated_at` (best available
    for historical rows). Existing audit rows are all tickets, so the
    `default 'ticket'` backfills them for free.

- **R-2 — earnings leaned on OR-composed RLS and over-counted.** `_select_own`
  (buyer) and `_select_host` compose with **OR**, and the earnings reads had no
  host filter — so a host who _also bought a ticket_ on someone else's event had
  that buyer row counted as their own earnings. Added `.eq('events.host_id',
user.id)` to the loader + CSV; RLS stays as defense-in-depth.

- **R-3 — CSV formula injection, fixed platform-wide.** `csvCell` quoted
  `",\n` but didn't neutralize a leading `= + - @` / TAB / CR, so a malicious
  event title or display name could execute as a formula in a downloaded
  statement. The three identical copies (receipts, earnings, **attendee
  export**) were collapsed into one hardened, tested
  [lib/csv.ts](../../apps/web/src/lib/csv.ts) — so the attendee export (which
  emits user-controlled names) got fixed in the same move (partial R-7).

- **R-11 — copy followed the data.** Receipts/earnings headers + empty states
  now say "tickets, team entry fees, and tips" instead of "ticket sales" /
  "event signup," which were actively wrong once R-1 landed.

## Patterns / gotchas surfaced

- **vitest `vi.mock` hoist TDZ.** The new mediator test first declared
  `const recordPaymentAudit = vi.fn()` and referenced it inside the hoisted
  `vi.mock('@/lib/handlers', …)` factory → `Cannot access … before
initialization`. The repo's established pattern (see `checkout.test.ts`) is to
  build the fns _inside_ the factory and pull references back off the imported
  `repositories` object afterward. Followed that.
- **PostgREST embedded-column filter.** Filtering the `events:events!inner(…)`
  embed by `.eq('events.host_id', …)` (R-2) mirrors the existing
  `.eq('division.event_id', …)` in `refund-ticket.ts` — filter path is the embed
  alias, and the column need not be in the select list.

## Deferred

- **R-4 / R-7 remainder** — `csvCell` is now extracted + tested, but the
  group-by-payment-intent reducer is still copy-pasted across 4 readers; extract
  - unit-test it next (it's also where R-6's null-PI netting fix belongs).
- **R-5 / R-6 (off-platform cash)** — cash rows still take a phantom platform
  fee in earnings and don't net paid+refund pairs (distinct `audit:<id>` keys).
- **Tip fee exactness** — the earnings estimate applies the host's flat tier
  rate to tips, which carry their own `platform_fee_cents`. Acceptable under the
  "Stripe is authoritative" disclaimer; revisit only if exactness is wanted.
- **Types** — `database.types.ts` was hand-edited for the new `category` column;
  regenerate against the deployed schema after the migration ships.
