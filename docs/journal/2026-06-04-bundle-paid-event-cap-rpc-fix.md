# Writing the Rachel subscription e2es surfaced a disabled paid-event cap (2026-06-04)

## Context

Continuation of the persona-e2e Stripe push. The last open Stripe cluster was
**Rachel Kim (P17, lapsed Pro)** — four subscription-lifecycle scenarios. Rather
than drive Stripe `customer.subscription.*` webhooks, the harness flips
`host_subscriptions.status` directly through the admin client (mirroring
`apps/web/scripts/set-host-subscription.mjs`) and restores it after. Two of the
four (the rolling-30d paid-event cap, and the "cancelling doesn't free a slot"
abuse guard) assert that a free host's **second** paid event is blocked. Writing
the assertion surfaced that the cap never fires.

## The bug

`host_paid_event_count_30d` — the RPC behind `validateHostPaidEventCap` — was
created in
[20260517000000_pro_subscriptions.sql](../../supabase/migrations/20260517000000_pro_subscriptions.sql)
reading `events.price_cents`. Three weeks later
[20260605000500_phase_9d_drop_legacy_events_cols.sql](../../supabase/migrations/20260605000500_phase_9d_drop_legacy_events_cols.sql)
**dropped `events.price_cents`** when pricing moved onto `event_divisions`
(ADR 0006). Postgres doesn't track column dependencies for `language sql`
function bodies, so the drop succeeded and left the function referencing a
column that no longer exists. At call time it raises _"column
events.price_cents does not exist"_; the caller swallows it:

```ts
// SupabaseHostSubscriptionRepository.paidEventCount30d
const { data, error } = await this.client.rpc('host_paid_event_count_30d', …);
if (error) return 0;           // ← the "column does not exist" error, swallowed
return Number(data ?? 0);
```

So `validateHostPaidEventCap` always saw count `0` and returned `{ ok: true }` —
the free-tier "1 paid event / 30 days" cap has been **silently disabled** since
2026-06-05. The whole gate (message, `ErrorActionLink` CTA, the rollback in
`events/new/actions.ts`) is intact and unreachable.

## The fix

Migration
[20260913000000_fix_host_paid_event_count_30d_event_divisions.sql](../../supabase/migrations/20260913000000_fix_host_paid_event_count_30d_event_divisions.sql)
redefines the RPC (same signature) to count over the current pricing column:

```sql
select count(distinct e.id)::int
  from public.events e
  join public.event_divisions d on d.event_id = e.id
 where e.host_id = p_user_id and d.price_cents > 0
   and e.created_at >= now() - interval '30 days'
```

`distinct e.id` so a multi-paid-division event counts once. **Status-agnostic on
purpose** — a `cancelled` paid event still occupies the slot, which is the abuse
guard the persona doc calls out (cancelling must not free a free-tier slot).

## Decisions

- **Fixed the RPC, not the swallow.** The `if (error) return 0` is a reasonable
  fail-open for a count, but it's what hid the breakage for ~4 weeks. Left it as
  is (a count that errors shouldn't hard-fail event creation) — the real defect
  is the stale column reference. Worth a follow-up: log the swallowed error so
  the next column rename doesn't hide for a month.
- **Status-agnostic count is intentional**, matching the original (which had no
  status filter either) and the abuse-guard requirement. Confirmed against the
  Rachel "cancelling doesn't free a slot" scenario.
- **Behavioural change flagged.** Re-enabling the cap means free hosts who were
  creating unlimited paid events (because it was broken) are capped at 1/30d
  again. That's the documented intent, but it's a live behaviour shift — called
  out in [e2e-tests.md](../audits/e2e-tests.md) and left uncommitted for review.

## Changes

- `supabase/migrations/20260913000000_*` — the RPC fix.
- `apps/web/tests/e2e/_helpers/host-subscription.ts` (new) — admin-client
  `setHostSubscriptionStatus` / `restoreHostSubscription`, plus `armStandaloneBracket`
  and `armPaidEvent` cap-arming fixtures.
- `apps/web/tests/e2e/persona-rachel-lapsed-pro.authed.spec.ts` — four lifecycle
  tests (Pro-perk loss, bracket cap, paid cap, abuse guard). The two cap tests
  are the executable regression for the fix: they fail against the broken RPC
  (cap never blocks) and pass once the migration applies.

## Follow-ups

- **Apply the migration on dev** (`pnpm db:migrate` / CI deploy) before the two
  paid-cap specs can go green — they're deploy-gated on it.
- **Log the swallowed RPC error** in `paidEventCount30d` so a future column drop
  surfaces instead of silently fail-opening.
- **Audit for the same class** — any other `language sql` RPC referencing a
  column dropped after its creation migration. `host_paid_event_count_30d` was
  the one the e2e happened to exercise; a grep for legacy columns in RPC bodies
  would find siblings.
