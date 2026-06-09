# 2026-06-08 — Receipts & tax follow-on fixes (R-4…R-9)

## Context

Follow-on to [the ledger-completeness bundle](2026-06-08-bundle-receipts-tax-ledger-completeness.md)
(R-1/R-2/R-3/R-11). This bundle closed the remaining actionable findings in
[receipts-tax.md](../audits/receipts-tax.md): R-4 + R-7 (extraction + tests),
R-8 (dead `'failed'`), R-9 (synthetic receipt number), and R-5 + R-6
(off-platform cash). After it, 10 of 12 findings are fixed; only R-10 (perf,
deferred) and R-12 (`tax_id` plaintext, acknowledged) remain. Quad-green,
uncommitted; the three migrations are deploy-gated.

## Decisions

- **R-7 / R-4 — one tested fold, not four.** The group-by-payment-intent reducer
  was copy-pasted across the receipts page, receipts CSV, earnings loader, and
  earnings CSV with subtle drift. Extracted to
  [lib/receipts.ts](../../apps/web/src/lib/receipts.ts) as
  `groupAuditRowsByPaymentIntent(rows, project)` — generic over a `project`
  callback that supplies each reader's per-transaction fields and returns `null`
  to skip a row (preserving the `if (!r.events) continue` guard). Also pulled out
  `estimatePlatformFeeCents`. Left the single-receipt **detail** page on its own
  aggregation — it folds one PI and reads richer event fields, a different shape;
  forcing it through the generic helper would have been a worse fit.
- **R-8 — delete the dead value, then let the DB enforce it.** Nothing ever wrote
  `action = 'failed'` (the domain type was already `'paid' | 'refunded'`;
  `payment_intent.payment_failed` is a no-op). Removing the four
  `.neq('action','failed')` reader filters is only safe if a `'failed'` row truly
  can't appear — so the same bundle tightened the CHECK to `('paid','refunded')`.
  The constraint is what makes dropping the filters safe-by-construction, not an
  afterthought.
- **R-5 / R-6 — an explicit `off_platform` flag, not null-PI inference.** Cash
  rows (host marks an attendee paid out-of-band) have a null `payment_intent_id`.
  We could have inferred "off-platform" from that, but added an explicit
  `off_platform boolean` column instead: it's self-documenting and keeps a future
  non-cash null-intent path from being mis-classified as cash. The cash write
  site sets it; a backfill flips existing null-intent rows.
  - **R-5 (phantom fee).** The earnings fee estimate now runs over on-platform
    net only — cash the host collected directly carries no PickupVB fee, so it
    keeps 100%. `estPayout = net − fee` still holds because the fee simply
    excludes the cash portion.
  - **R-6 (cash pairs don't net).** The fold keys an off-platform row by
    `cash:<event>:<user>` instead of the per-row `audit:<id>`, so a cash paid +
    later "mark unpaid" net into one transaction. This needed `user_id` added to
    the earnings + receipts-CSV selects (to avoid merging different payers' cash
    on one event) — a server-only grouping key, never rendered.
  - **Chose the `cash:` key over a write-time correlation id.** The alternative
    (stamp a shared surrogate at write time) would have polluted the
    `payment_intent_id` column. The trade-off is that the group key doubles as the
    single-receipt route param, so the detail page gained a third lookup branch
    (`cash:` → aggregate every off-platform row for that event + viewer) and the
    R-9 receipt number renders `Off-platform`. Both CSVs print `off-platform` in
    the `payment_intent_id` column rather than the synthetic key.

## Patterns / gotchas

- **Generic object-spread in the fold.** `{ ...fields, ...base } as LedgerTransaction & X`
  needs the cast — TS widens a generic spread (`...fields` where `fields: X`) and
  won't infer the intersection on its own. Money keys are spread last so they win
  on any (never-actually-occurring) projection collision.
- **`project` runs per row, result used only on first-seen.** Calling it for
  every row (not just the first per key) is what preserves the original
  `continue`-on-null-event skip for fold rows too; the discarded projections are
  cheap.

## Deferred

- **R-10** — receipts/earnings still fetch the whole ledger per render
  (force-dynamic, uncached) then slice. Fine at current volume; revisit with a
  year-scoped default or a stored aggregate if it grows.
- **R-12** — `tax_id` plaintext (RLS owner-only, absent from `profiles_public`,
  no leak); optional SSN-pattern guard if hardening.
- **Types** — `database.types.ts` was hand-edited for `category` + `off_platform`;
  regenerate from the deployed schema once the migrations ship.
- Historical team-refund backfill rows are stamped at `updated_at` (the table has
  no `refunded_at`) — approximate refund date for those rows only.
