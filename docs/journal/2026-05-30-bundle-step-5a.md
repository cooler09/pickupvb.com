# Step 5a — Drop `event_id` from division-scoped tables (2026-05-30)

## Context

P2 #6.5 Bundle B from [docs/audits/event-data-model.md](../audits/event-data-model.md).
Bundle A (2026-05-29) already dropped `event_id` from `event_brackets` +
`event_team_registrations`. Bundle B is the bigger half — the four
remaining division-scoped tables (`event_attendees`, `event_teams`,
`event_free_agents`, `event_team_payments`) whose PKs / composite FKs
were keyed on `event_id`. Pre-launch destructive window, so we cut the
column outright rather than dual-writing through a deprecation period.

User picked the **5a / 5b / 5c split** (over a single mega-bundle) so
each half ends with a green verify chain. 5a is just Bundle B.

## Decisions

- **Chose PostgREST embedded `division:event_divisions!inner(event_id)` joins**
  over per-call division-id pre-loads where the query only filters by
  event. Keeps reads to a single round-trip and matches Bundle A's shape
  for `event_team_registrations` / `event_brackets`. Used the `.in(...)`
  pre-load only where the query also has to update / delete by user_id
  scope (reminders cron, refund-ticket).
- **Webhook attendee lookups switched from `(event_id, user_id)` to
  `checkout_session_id`** rather than reconstructing the composite via a
  division lookup. `checkout_session_id` is globally unique, already
  stamped on the row at checkout creation, and matches Stripe's own
  primary identifier — strictly more robust. Same for the cancel /
  success routes.
- **`SupabaseEventRepository.save()` skips child-table inserts when the
  event has != 1 division** (single-division upserts still work via a
  preloaded `soleDivisionId`). Multi-division writes have to go through
  the dedicated handlers (`attachTeamToDivision`, ad-hoc team handlers,
  …) that pass `division_id` explicitly. Chose silent-skip over throwing
  because the save() path is a reconciliation no-op for already-correct
  multi-division state — throwing would force every multi-division
  caller to opt out of `save()`'s child-table sync.
- **`EventPricing` now carries `divisionId`** so single-division per-player
  flows (`checkout-actions`, `manage-payments-actions`) can scope by
  `division_id` without a second lookup. The pricing helper already
  loaded the division row; cheap to expose.
- **Dropped `fill_default_division_id()` trigger + function in the same
  migration.** It read `new.event_id` which is gone — would break every
  insert. Now every caller passes `division_id` explicitly; this was
  the implicit pre-condition for landing Bundle B.

## Changes

- [supabase/migrations/20260730000000_drop_event_id_pk_reshape.sql](../../supabase/migrations/20260730000000_drop_event_id_pk_reshape.sql)
  — 14-section migration: drop views (0); drop consistency + fill-default
  triggers/functions (1); drop policies (2); backfill + drop
  `event_team_payments.event_id` → `division_id` (3); reshape
  `event_teams.pk` (4); recreate `event_team_payments` FK + unique (5);
  reshape `event_free_agents.pk` (6); drop `event_attendees.event_id`
  - recreate partial unique + reminder indexes on `division_id` (7);
    recreate RLS via `event_divisions` joins (8); rewrite
    `enforce_event_capacity()` (9) + `event_paid_attendee_count()` (10);
    rebuild `events_view` (11) + `metro_health_weekly` +
    `host_activity_monthly` (12); index recap (13).
- [packages/supabase/src/database.types.ts](../../packages/supabase/src/database.types.ts)
  — hand-edited (Docker still off locally): dropped `event_id` from
  Row/Insert/Update for the four tables; renamed
  `event_team_payments.event_id` → `division_id` + new FK relationship
  to `event_teams(division_id, team_id)`.
- Infra: `SupabaseEventRepository` (heaviest — embedded joins for
  `findById`/`getDetail`/`searchFollowingFeed`, preloaded `divisionIds`
  for `save()`, upsert-by-composite for `attachTeamToDivision` +
  `attachFreeAgentToDivision`); `SupabaseEventTeamPaymentRepository`
  (translate at adapter boundary via `event_teams` lookup on save +
  embedded `division.event_id` on hydrate); `SupabaseBracketRepository`
  (dropped event_id filter); `SupabaseEventTeamRegistrationRepository`
  (dropped event_id from insert + embedded-join detach).
- App (~17 files): [apps/web/src/lib/event-pricing.ts](../../apps/web/src/lib/event-pricing.ts)
  exposes `divisionId`; [checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts)
  - [manage-payments-actions.ts](../../apps/web/src/app/events/%5Bid%5D/manage-payments-actions.ts)
    switch to `pricing.divisionId`; loaders / broadcast / edit / cancel
    / record-winner / roster-team / attendees.csv / pricing-lock /
    refund-ticket / reminders cron / edit/page all use embedded joins
    or preloaded divisionIds; webhook + checkout/cancel + checkout/success
    routes filter by `checkout_session_id`; [apps/web/src/hooks/use-event-attendees.ts](../../apps/web/src/hooks/use-event-attendees.ts)
    pre-fetches `divisionIds` and subscribes with Realtime
    `filter: division_id=in.(...)`.
- [docs/audits/event-data-model.md](../audits/event-data-model.md) —
  remediation log entry under "P2 #6.5 Bundle B (Step 5a) landed."
- [docs/audits/README.md](../audits/README.md) — bumped index date to
  2026-05-30.

## Patterns observed

- **Embedded PostgREST join as a filter target.** Pattern is
  `.select('..., division:event_divisions!inner(event_id)').eq('division.event_id', id)`.
  The `!inner` is what makes `division.event_id` a valid filter; without
  it PostgREST treats the nested table as a left join and the filter
  becomes a no-op. Already in AGENTS.md "Supabase joins" section in
  spirit; could be promoted to a named pattern once #6.6 / #6.7 land
  more uses.
- **Realtime `filter: 'col=in.(a,b,c)'` is supported** and is the right
  primitive when an aggregate root maps to multiple child rows. Beats
  N subscriptions per child.
- **Webhook lookups should key off Stripe's own identifiers
  (`checkout_session_id`, `payment_intent_id`) when available** —
  globally unique, already on the row, no app-table-shape coupling.
  This is now true for every attendee path through the Stripe webhook.

## Follow-ups

- **Step 5b**: P2 #6.6 collapse `event_teams` + `event_team_registrations`
  - `event_team_registration_members` → `event_team_entries` +
    `event_team_entry_members` with a `source` discriminator. Audit
    has the full plan.
- **Step 5c**: P2 #6.7 collapse `event_attendees` + `event_free_agents`
  → `event_participants` with a `role` discriminator. PK
  `(division_id, user_id)` gives mutual-exclusion for free.
- **Generated `database.types.ts` regen**: Docker is still off locally
  so we hand-edited. Re-run `pnpm --filter @pickupvb/supabase gen:types`
  once Docker is back on to confirm the hand-edits match the post-migration
  reality. Low risk — the diff is mechanical.
- **`SupabaseEventRepository.save()` multi-division silent skip**: if
  any future caller adds a child-table write through the aggregate, the
  skip might bite. Worth converting to an explicit `if (multiDivision)
return early` with a doc-comment once Step 5b clarifies the
  team-entry write path.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.
189 domain + 17 application + 50 web Vitest tests pass. Lint emits 3
pre-existing `react-hooks/set-state-in-effect` warnings in scoreboard
pages (untouched). Migration not applied locally (Docker off); CI/CD
applies on deploy per AGENTS.md.
