# Receipts & tax information audit

**Date:** 2026-06-08
**Scope:** buyer-facing receipts, host-facing earnings, annual CSV statements,
and the business / tax-ID profile fields. Covers the read paths
(`/profile/receipts`, `/profile/receipts/[paymentIntentId]`,
`/profile/billing/earnings`, `/api/receipts/[year]/statement.csv`,
`/api/earnings/[year]/statement.csv`) and the single write surface they all
read from — the `event_payment_audit` ledger.

> **Status (2026-06-08): new audit — 1 P1 · 3 P2 · 8 P3.**
> **Fixed same day (quad-green, uncommitted, migrations deploy-gated): R-1, R-2,
> R-3, R-8, R-9, R-11 + partial R-4/R-7.** The ledger now records tip and
> team-entry payments (+ refunds) under a new `category` column with a backfill;
> the host read filters to income categories; CSV cells are formula-injection
> safe; the dead `'failed'` action is gone (CHECK tightened); off-platform
> receipts print a clean number. **Remaining open: R-5, R-6, R-10, R-12, and the
> leftover R-4/R-7 grouping-reducer extraction.** See the remediation log.
>
> RLS posture is sound (`event_payment_audit` reads are scoped by the
> `_select_own` / `_select_host` policies; `tax_id` / `business_*` are
> owner-only and absent from `profiles_public` — no PII leak).

---

## How the data flows (orientation)

Every receipt/earnings/statement surface reads the **same** ledger table,
`public.event_payment_audit` (defined in
[20260516000000_ticketed_events.sql#L75-L92](../../supabase/migrations/20260516000000_ticketed_events.sql#L75-L92)):

```
action ∈ ('paid','refunded','failed'),  amount_cents ≥ 0,  payment_intent_id?, user_id?
```

**Readers** (all group rows by `payment_intent_id`, falling back to a
synthetic `audit:<row-id>` key):

- Buyer list — [profile/receipts/page.tsx](../../apps/web/src/app/profile/receipts/page.tsx)
- Buyer single receipt — [profile/receipts/[paymentIntentId]/page.tsx](../../apps/web/src/app/profile/receipts/[paymentIntentId]/page.tsx)
- Buyer annual CSV — [api/receipts/[year]/statement.csv/route.ts](../../apps/web/src/app/api/receipts/[year]/statement.csv/route.ts)
- Host earnings — [billing/earnings/\_loaders/load-earnings.ts](../../apps/web/src/app/profile/billing/earnings/_loaders/load-earnings.ts)
- Host annual CSV — [api/earnings/[year]/statement.csv/route.ts](../../apps/web/src/app/api/earnings/[year]/statement.csv/route.ts)
- GDPR export — [api/account/export/route.ts#L82-L86](../../apps/web/src/app/api/account/export/route.ts#L82-L86)

**Writers** (only three, and they cover only a subset of payment kinds):

- `recordPaymentAudit` from the webhook — [webhooks/checkout.ts#L87-L93](../../apps/web/src/lib/webhooks/checkout.ts#L87-L93) (`paid`, **attendee kind only**) and [webhooks/charge.ts#L63-L69](../../apps/web/src/lib/webhooks/charge.ts#L63-L69) (`refunded`)
- Synchronous refund — [lib/refund-ticket.ts#L114-L123](../../apps/web/src/lib/refund-ticket.ts#L114-L123) (`refunded`)
- Host marks cash paid/unpaid — [events/[id]/manage-payments-actions.ts#L82-L87](../../apps/web/src/app/events/[id]/manage-payments-actions.ts#L82-L87) (`paid`/`refunded`, off-platform)

The gaps below fall out of this map: the ledger is **only** fed by the
attendee-ticket and cash paths, so everything else (teams, tips) is invisible
to the entire receipts/tax surface.

---

## Findings

| ID   | Sev | Summary                                                                                                      |
| ---- | --- | ------------------------------------------------------------------------------------------------------------ |
| R-1  | P1  | ✅ FIXED — tip + team (ad-hoc/roster) payments + refunds now recorded under a `category` column; backfilled  |
| R-2  | P2  | ✅ FIXED — earnings reads now filter `events.host_id`; was over-counting a host who is also a buyer          |
| R-3  | P2  | ✅ FIXED — CSV cells now neutralize formula injection (`=`/`+`/`-`/`@`/TAB/CR); shared helper                |
| R-4  | P2  | ◑ PARTIAL — `csvCell` now unit-tested; grouping/fee math still untested (tied to R-7 extraction)             |
| R-5  | P3  | Off-platform cash payments get a phantom platform-fee deduction in earnings                                  |
| R-6  | P3  | Off-platform paid+refund pairs don't net (each null-PI row gets its own group key)                           |
| R-7  | P3  | ◑ PARTIAL — `csvCell` extracted to one tested home; the group-by-PI reducer is still copy-pasted 4×          |
| R-8  | P3  | ✅ FIXED — dead `'failed'` removed: 4 `.neq` filters + type unions dropped, CHECK tightened to paid/refunded |
| R-9  | P3  | ✅ FIXED — synthetic rows now print `#<SHORT>` instead of the raw `audit:<uuid>` key                         |
| R-10 | P3  | Receipts/earnings fetch the entire ledger every render (force-dynamic, uncached) then slice                  |
| R-11 | P3  | ✅ FIXED — receipts + earnings copy now names tickets / team entries / tips (landed with R-1)                |
| R-12 | P3  | `tax_id` stored plaintext, relies on the user heeding the "don't enter SSN" warning                          |

---

### R-1 (P1) — Team, roster-team, and tip payments are absent from every receipt/earnings/tax surface

[`handleCheckoutCompleted`](../../apps/web/src/lib/webhooks/checkout.ts#L46-L284)
calls `recordPaymentAudit` **only** in the `kind === 'attendee'` branch
([checkout.ts#L87-L93](../../apps/web/src/lib/webhooks/checkout.ts#L87-L93)).
The `tip`, `team_registration`, `roster_team_payment`, `sponsor_slot`, and
`badge_slot` branches mutate their own tables but never touch
`event_payment_audit`. The team mediators
([team-payment-mediators.ts](../../apps/web/src/lib/webhooks/team-payment-mediators.ts))
likewise persist through the aggregate without an audit row.

Because **all** receipt/earnings/statement surfaces read exclusively from
`event_payment_audit`, the consequences are:

- **Host earnings are radically incomplete.** A tournament host whose revenue
  is entirely team entry fees sees an **empty** `/profile/billing/earnings`
  page and an empty annual CSV — even though the CSV is labelled "Good for
  taxes and bookkeeping" ([earnings-sections.tsx#L237](../../apps/web/src/app/profile/billing/earnings/_components/earnings-sections.tsx#L237)).
  Tips (host income via Connect transfer) are likewise omitted.
- **Buyers get no receipt for the largest payments.** A captain who pays a
  $200+ team entry fee gets **no** receipt row and **no** annual-statement
  line — arguably the single most tax-relevant payment a user makes on the
  platform.

This is graded **P1** because the feature is explicitly sold for tax/bookkeeping
use and silently omits the largest class of revenue, producing materially
incomplete records a user might file taxes on.

**Recommended fix:** record an audit row for every revenue kind that lands on
an event the host is paid out for. In `handleCheckoutCompleted`, add a
`recordPaymentAudit({ eventId, userId: <buyer/captain>, action: 'paid',
amountCents, paymentIntentId })` call to the `tip`, `team_registration`, and
`roster_team_payment` branches (and to the refund/expire paths in
[team-payment-mediators.ts](../../apps/web/src/lib/webhooks/team-payment-mediators.ts)
for `refunded`). For team payments the natural `user_id` is the captain who
paid. Decide deliberately whether `sponsor_slot`/`badge_slot` (platform
revenue, not host payout) belong on the **buyer's** receipts — they probably
do for the buyer's records, but must **not** count toward host earnings (they
aren't host income). The cleanest separation is an explicit `kind`/`category`
column on `event_payment_audit` so the host read can filter to host-payout
kinds while the buyer read shows them all. Add migration + regenerate types;
backfill existing team/tip rows from `event_team_registrations` /
`event_team_payments` / `event_tips` so historical statements aren't blank.

---

### R-2 (P2) — Earnings reads have no host filter; OR-composed RLS over-counts a host who is also a buyer

Two SELECT policies compose with **OR** on `event_payment_audit`:
`_select_own` (`user_id = auth.uid()`,
[20260521000000_receipts_rls.sql](../../supabase/migrations/20260521000000_receipts_rls.sql))
and `_select_host` (event hosted by `auth.uid()`,
[20260522000000_earnings_rls.sql](../../supabase/migrations/20260522000000_earnings_rls.sql)).

The host earnings reads carry **no explicit host filter** — they fetch the
whole table and lean on RLS:

- [load-earnings.ts#L87-L93](../../apps/web/src/app/profile/billing/earnings/_loaders/load-earnings.ts#L87-L93)
- [api/earnings/[year]/statement.csv/route.ts#L63-L71](../../apps/web/src/app/api/earnings/[year]/statement.csv/route.ts#L63-L71)

So when a host **also buys a ticket** on someone _else's_ event, that buyer row
matches `_select_own` and is returned — then aggregated into the host's
**gross / net / estimated-payout** totals and shown as a foreign event in the
"By event" table and CSV. The host over-reports income (and sees an event they
don't host in their earnings). It triggers whenever a host attends another
host's paid event — common.

Contrast the buyer reads, which _do_ filter explicitly
(`.eq('user_id', user.id)`,
[receipts CSV#L60](../../apps/web/src/app/api/receipts/[year]/statement.csv/route.ts#L60)),
so they aren't affected.

**Recommended fix:** filter the embedded `events` resource by host on both
earnings reads — `.eq('events.host_id', user.id)` alongside the existing
`events:events!inner(...)` embed (PostgREST supports filtering an `!inner`
embedded column). That makes the read correct regardless of the RLS OR and is
defense-in-depth against the policy composition (AGENTS.md pitfall #8 spirit —
don't let an OR policy silently widen a financial read).

---

### R-3 (P2) — CSV statements are open to spreadsheet formula injection

Both CSV routes escape cells with `csvCell`, which only quotes values
containing `"`, `,`, or newline:

- [receipts CSV#L182-L186](../../apps/web/src/app/api/receipts/[year]/statement.csv/route.ts#L182-L186)
- [earnings CSV#L175-L179](../../apps/web/src/app/api/earnings/[year]/statement.csv/route.ts#L175-L179)

Neither neutralizes a cell that **begins** with `=`, `+`, `-`, `@`, tab, or CR.
`event_title` and `host` (display name) are attacker-controllable: a host names
an event `=HYPERLINK("http://evil","click")` or `=cmd|'/c calc'!A1`, a buyer
downloads their annual statement, and Excel/Sheets executes the formula on
open. This is the standard CSV/formula-injection class.

**Recommended fix:** in `csvCell`, if the trimmed value starts with one of
`= + - @ \t \r`, prefix it with a single quote (`'`) — or wrap it in quotes and
prepend a tab — before the existing comma/quote escaping. Apply to both routes
(or, with R-7, the one shared helper).

---

### R-4 (P2) — No test coverage on any of the money logic

The grouping reducer, the platform-fee math (`Math.round(net * feeRate)`), the
UTC year-window boundaries, and CSV escaping are all untested. Per AGENTS.md
testing guidance, Stripe/money flows that are "silent in prod" are exactly
where a Vitest case is warranted. A refactor (R-7) or the R-3 escaping fix could
regress silently today.

**Recommended fix:** add `apps/web` Vitest cases for the extracted grouping
helper (paid+refund nets to one transaction; null-PI rows stay distinct vs.
grouped — see R-6 decision), the fee/payout math, the year filter, and
`csvCell` formula-injection neutralization. Pure functions, no Supabase mock
needed once the reducer is extracted.

---

### R-5 (P3) — Off-platform cash payments get a phantom platform-fee deduction

When a host marks an attendee paid in cash,
[manage-payments-actions.ts#L82-L87](../../apps/web/src/app/events/[id]/manage-payments-actions.ts#L82-L87)
writes a `paid` audit row with `payment_intent_id = null`. The earnings page
then applies `platformFee = net * feeRate` to **all** transactions including
these — but PickupVB charges nothing on cash the host collected directly. Result:
"gross" includes money that never flowed through the platform, and "estimated
payout" is understated by a fee that was never taken. The receipts page also
labels these "online payment" (R-11).

**Recommended fix:** tag off-platform rows (a `source`/`off_platform` flag, or
treat `payment_intent_id IS NULL` as the signal) and exclude them from the
platform-fee calculation in [load-earnings.ts](../../apps/web/src/app/profile/billing/earnings/_loaders/load-earnings.ts)
and the earnings CSV; show them as a separate "collected off-platform" line.

---

### R-6 (P3) — Off-platform paid+refund pairs don't net

The grouping key is `payment_intent_id ?? \`audit:<row-id>\``. For cash payments
both the paid row and the later "marked unpaid" (`refunded`) row have
`payment_intent_id = null`, so each gets a **distinct** `audit:<id>` key and
they never merge. A cash mark-paid → mark-unpaid shows as two separate
transactions (`+$X` and a `−$X` net-negative row) instead of one net-$0 entry.
The all-time total still sums correctly, but the list is misleading.

**Recommended fix:** when grouping, correlate null-PI rows by
`(event_id, user_id)` (or stamp a synthetic correlation id when the cash row is
written) so the paid/refund pair nets. Decide alongside R-4's test.

---

### R-7 (P3) — The group-by-payment-intent reducer is duplicated 4×

The same "fold audit rows into per-`payment_intent` transactions" reducer is
hand-reimplemented, with subtle variations, in:

- [receipts/page.tsx#L94-L125](../../apps/web/src/app/profile/receipts/page.tsx#L94-L125) (also tracks `paidAt`/`refundedAt`)
- [receipts CSV#L94-L120](../../apps/web/src/app/api/receipts/[year]/statement.csv/route.ts#L94-L120)
- [load-earnings.ts#L106-L130](../../apps/web/src/app/profile/billing/earnings/_loaders/load-earnings.ts#L106-L130)
- [earnings CSV#L83-L108](../../apps/web/src/app/api/earnings/[year]/statement.csv/route.ts#L83-L108)

The variations are a drift/bug vector (e.g. R-6's grouping decision currently
has to be fixed in four places). The buyer receipt detail page also has a
near-identical aggregation.

**Recommended fix:** extract one `groupAuditRowsByPaymentIntent(rows)` (plus
`usd()` / `csvCell()`) into a shared module (e.g. `apps/web/src/lib/receipts.ts`)
and have all five readers call it. This is also the seam R-4's tests attach to.

---

### R-8 (P3) — The `'failed'` action is dead code

No writer ever inserts `action: 'failed'` — `handlePaymentFailed` is an
intentional no-op ([charge.ts#L36-L38](../../apps/web/src/lib/webhooks/charge.ts#L36-L38)),
checkout only writes `paid`, refunds write `refunded`. Yet the value is carried
by the CHECK constraint
([20260516000000_ticketed_events.sql#L80](../../supabase/migrations/20260516000000_ticketed_events.sql#L80)),
three `action` type unions, and **four** `.neq('action', 'failed')` filters
(receipts page, receipts CSV, earnings loader, earnings CSV) that defend against
rows that can never exist.

**Recommended fix:** either start recording failed attempts (low value — Stripe
already has them), or drop the `'failed'` enum member, the type-union members,
and the `.neq` filters as stale. Note in the migration if the constraint value
is removed.

---

### R-9 (P3) — `Receipt #audit:<uuid>` on a printable receipt

For null-PI rows the detail page renders the synthetic key verbatim as the
receipt number — `Receipt #audit:3f2a…`
([receipts/[paymentIntentId]/page.tsx#L165](../../apps/web/src/app/profile/receipts/[paymentIntentId]/page.tsx#L165)).
Looks broken on a document a user hands to an accountant.

**Recommended fix:** when the key starts with `audit:`, show a friendlier
identifier (e.g. the short row id, or "Off-platform — `<date>`") instead of the
raw synthetic key.

---

### R-10 (P3) — Whole-ledger fetch on every render

Both the receipts page
([page.tsx#L82-L91](../../apps/web/src/app/profile/receipts/page.tsx#L82-L91))
and the earnings loader
([load-earnings.ts#L87-L93](../../apps/web/src/app/profile/billing/earnings/_loaders/load-earnings.ts#L87-L93))
are `force-dynamic` (uncached) and fetch the **entire** audit history, then
group and slice in memory for pagination. This is consistent with AGENTS.md
pattern #12 (derived list → in-memory slice) and fine at today's volume, but a
high-throughput host re-pulls the full ledger on every page view.

**Recommended fix:** acceptable to defer. If volume grows, scope the default
read to the current + prior year (with an "all years" affordance) or back the
totals with a stored aggregate; keep the CSV full-year.

---

### R-11 (P3) — Receipts page copy is inaccurate

The header reads "Every online payment you've made for an event signup"
([page.tsx#L153-L156](../../apps/web/src/app/profile/receipts/page.tsx#L153-L156)),
but the list currently **excludes** team-registration signups (R-1) and
**includes** host-marked cash, which isn't an online payment (R-5).

**Recommended fix:** tighten the copy once R-1/R-5 land (e.g. "Payments for
event signups, including team entries and tips. Cash payments your host recorded
are marked separately.").

---

### R-12 (P3) — `tax_id` plaintext relies on the user heeding a warning

`tax_id` is stored as plain `text` on `profiles`
([20260523000000_profiles_business_fields.sql](../../supabase/migrations/20260523000000_profiles_business_fields.sql)).
RLS is owner-only and the field is **not** in `profiles_public` (verified), and
the host's `business_*` fields are read only via the admin client on an already
authorized receipt — so there is **no leak**. The residual risk is purely that
the form's "do not enter an SSN — not encrypted" warning
([business-info-form.tsx#L73-L76](../../apps/web/src/app/profile/receipts/business-info-form.tsx#L73-L76))
is advisory; a user can still type an SSN-shaped value.

**Recommended fix:** acknowledged risk, low priority. If hardening: trim
whitespace server-side, and optionally soft-warn / reject a bare 9-digit
`XXX-XX-XXXX` SSN pattern in
[business-info-actions.ts](../../apps/web/src/app/profile/receipts/business-info-actions.ts).
Full encryption is out of scope unless the platform decides to store sensitive
tax identifiers.

---

## What's already correct (don't "fix" these)

- **RLS scoping is sound.** Buyer reads filter on `user_id`; host reads are
  gated by `_select_host`; `tax_id`/`business_*` are owner-only and excluded
  from `profiles_public`. The receipt detail page correctly uses the admin
  client to read the host's `business_*` ("Sold by") because those columns are
  intentionally not in the public view.
- **Refund netting via `payment_intent_id`** works for the Stripe path — a
  paid+refunded pair on the same PI nets to one transaction across all readers.
- **CSV cache headers** (`private, no-store`) and the `year` bounds check
  (2000–2100) are correct.
- The webhook→ledger `recordPaymentAudit` for attendee tickets, the synchronous
  refund audit row, and the GDPR export of `event_payment_audit` are all wired
  correctly for the kinds they cover.

---

## Remediation log

### 2026-06-08 (pt. 3) — R-8, R-9 fixed (quad-green, uncommitted, migration deploy-gated)

- **R-8 (dead `'failed'` action).** Removed the four `.neq('action','failed')`
  reader filters (receipts page, receipts CSV, earnings loader, earnings CSV) and
  narrowed the five `AuditRow.action` type unions from
  `'paid' | 'refunded' | 'failed'` → `'paid' | 'refunded'`. Tightened the DB
  CHECK to `action in ('paid','refunded')` in
  [20260927000000_payment_audit_drop_failed_action.sql](../../supabase/migrations/20260927000000_payment_audit_drop_failed_action.sql)
  (with a defensive `delete where action = 'failed'` — there are none — so the
  constraint can re-add). Nothing wrote `'failed'` (the domain
  `PaymentAuditEntry.action` was already `'paid' | 'refunded'`;
  `payment_intent.payment_failed` is a no-op), so this is behaviour-preserving;
  the DB now enforces the real invariant, which is what makes dropping the
  reader filters safe-by-construction.
- **R-9 (synthetic receipt number).** The single-receipt page now prints
  `#<first-8-of-row-id, uppercased>` for off-platform / legacy rows whose
  grouping key is `audit:<uuid>`, instead of the raw `Receipt #audit:3f2a…`.
  Stripe-backed receipts still show the full payment-intent id. See
  [receipts/[paymentIntentId]/page.tsx](../../apps/web/src/app/profile/receipts/[paymentIntentId]/page.tsx).
- **Verify:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.

### 2026-06-08 (pt. 2) — R-1 fixed; R-11 fixed (quad-green, uncommitted, migration deploy-gated)

The ledger now records **every host-payout revenue kind**, not just attendee
tickets. A new `event_payment_audit.category` column classifies each row; the
host-earnings reads filter to the income allow-list `('ticket','tip','team')`,
while buyer receipts show all of a user's rows.

- **Schema** —
  [20260926000000_payment_audit_category.sql](../../supabase/migrations/20260926000000_payment_audit_category.sql):
  `category text not null default 'ticket'` + CHECK (`ticket`/`tip`/`team`/
  `sponsor_slot`/`badge_slot`, the last two reserved for forward-compat and not
  recorded yet), an index, and an **idempotent backfill** of historical paid +
  refunded tips (`event_tips`) and team entry fees (`event_team_payments` →
  entry → division → event, covering ad-hoc **and** roster). Existing rows are
  all tickets, so the default backfills them. Types hand-edited in
  `packages/supabase/src/database.types.ts` (regen against the deployed schema
  post-merge).
- **Write paths** — `recordPaymentAudit` now carries `category`. Added calls in
  the **tip** branch of [checkout.ts](../../apps/web/src/lib/webhooks/checkout.ts)
  and all four team paid/refund paths in
  [team-payment-mediators.ts](../../apps/web/src/lib/webhooks/team-payment-mediators.ts);
  the **tip-refund** path in [charge.ts](../../apps/web/src/lib/webhooks/charge.ts)
  records a matching `refunded` row (via `markTipsRefundedByPaymentIntent`, now
  returning the refunded tip's context + guarded on `status='paid'` for retry
  idempotency). The captain is the team payer; `user_id` is null for an
  account-less captain / anon tip. The `PaymentAuditEntry.userId` type widened
  to `string | null`.
- **Read paths** — host earnings loader + CSV add `.in('category',
['ticket','tip','team'])`. Buyer receipts unchanged (already user-scoped).
- **R-11 copy** — receipts + earnings headers/empty-states now say "tickets,
  team entry fees, and tips" instead of "ticket sales" / "event signup".
- **Tests** — new
  [team-payment-mediators.test.ts](../../apps/web/src/lib/webhooks/team-payment-mediators.test.ts)
  (8 cases: paid/refund ledger rows for ad-hoc + roster, account-less captain,
  refund-amount preference, idempotency); checkout/charge/adapter tests updated
  for the new `category` field, the tip audit, and the tip-refund return.
- **Deliberately deferred:** `sponsor_slot` / `badge_slot` are **not** recorded
  (platform revenue / host add-on — ambiguous income-vs-expense; the earnings
  allow-list already excludes them). The per-transaction earnings fee estimate
  still applies the host's flat tier rate to tips (tips carry their own
  `platform_fee_cents`) — acceptable under the page's "Stripe is authoritative"
  disclaimer; revisit if exactness is needed.
- **Verify:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  (313 web + 16 infra adapter tests pass).

### 2026-06-08 — R-2, R-3 fixed; R-4 / R-7 partially (quad-green, uncommitted, deploy-gated)

- **R-2 (earnings host filter).** Added `.eq('events.host_id', user.id)` to
  both host-earnings reads so a host who also buys tickets on other hosts'
  events no longer has those buyer rows counted as earnings. RLS is retained as
  defense-in-depth.
  - [load-earnings.ts](../../apps/web/src/app/profile/billing/earnings/_loaders/load-earnings.ts) (earnings page)
  - [api/earnings/[year]/statement.csv/route.ts](../../apps/web/src/app/api/earnings/[year]/statement.csv/route.ts) (annual CSV)
- **R-3 (CSV formula injection) + R-7 (csvCell duplication).** Extracted the
  three identical `csvCell` copies into one hardened, tested helper
  [lib/csv.ts](../../apps/web/src/lib/csv.ts). It now prefixes a cell beginning
  with `=` `+` `-` `@` TAB CR with a single quote before RFC-4180 quoting, so a
  malicious event title / display name can't execute as a spreadsheet formula
  in a downloaded statement. **Fix reaches beyond receipts/tax** — the
  attendee export ([api/events/[id]/attendees.csv](../../apps/web/src/app/api/events/[id]/attendees.csv/route.ts),
  which emits user-controlled display/first/last names) shared the same
  vulnerable copy and is now fixed too.
- **R-4 (tests).** Added [lib/csv.test.ts](../../apps/web/src/lib/csv.test.ts)
  (6 cases incl. the formula-injection vectors). The grouping reducer + fee math
  remain untested — best paired with the full R-7 extraction.
- **Verify:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  (304 web tests pass; lint warnings are pre-existing scoreboard code).
- **Still open:** R-1 (P1, needs a ledger `category` column + backfill
  migration), R-5, R-6, R-8…R-12, and the remaining R-4/R-7 grouping-reducer
  extraction.

### 2026-06-08 — findings filed

Initial audit — 1 P1 · 3 P2 · 8 P3.
