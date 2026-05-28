# 2026-05-30 — Bridge-view caller retargeting (Bundle A)

Closes the `bridge-view callers retargeting` follow-up that's been
trailing every event-data-model journal entry since the
`event_participants` / `event_participant_payments` collapse (Step
6/7, migration
[20260802000000_collapse_attendees_free_agents.sql](../../supabase/migrations/20260802000000_collapse_attendees_free_agents.sql)).
That migration introduced two SECURITY INVOKER **views** —
`event_attendees`, `event_free_agents` — with `INSTEAD OF
INSERT/UPDATE/DELETE` triggers over the canonical
`event_participants` (+ `event_participant_payments` for ticket
money) tables. The bridge let the existing application code keep
working unmodified ("Step 6/7 was a thin pass"), but every call site
was now reading and writing through a translation layer.

This bundle is **Bundle A** of a two-pass migration: retarget every
caller onto the canonical tables, leaving the views + triggers in
place as a behavioural backstop. **Bundle B**, deferred to a
separate migration PR, drops the views + triggers + the matching
entries in
[packages/supabase/src/database.types.ts](../../packages/supabase/src/database.types.ts).

## Why now (and why two passes)

Two reasons pushed this off the deferred list:

1. **Per-row payment metadata semantics were getting muddled.** The
   bridge view's `LEFT JOIN event_participant_payments` returned
   `coalesce(payment_status, 'pending')` for free RSVPs that had no
   payment row, and the bridge `INSTEAD OF INSERT` trigger always
   created a payment row (even for free events). New code being
   written against the bridge couldn't tell whether a payment row
   was guaranteed or not, and every "look up by `checkout_session_id`
   / `payment_intent_id`" call site was reaching for a column that
   physically lived on the payments table but appeared on the
   `event_attendees` view. The translation layer was leaking.
2. **Reminder timestamps were the tell.** `reminder_24h_sent_at` and
   `reminder_2h_sent_at` are on `event_participants` (they're
   participant metadata, not payment metadata). The bridge view
   surfaced them alongside `payment_status`, which made the
   reminders cron look like it was updating a single denormalised
   table. Once you write the canonical update directly, the seam
   between "who's coming" and "did they pay" becomes obvious.

Two passes (vs. one big PR that drops the views in the same change):

- **Bundle A is purely code; reversible by `git revert`.** No
  schema change in this PR means we can ship, run for a verify
  cycle, and confirm the canonical writes are doing what the
  bridge was doing without a migration in flight.
- **Bundle B is purely SQL; the destructive step.** Once the
  views go, there's no putting them back without a backfill, so
  isolating it lets the migration PR be reviewed on its own
  merits.

## What changed

Retarget shape, validated on
[pricing-lock.ts](../../apps/web/src/lib/pricing-lock.ts) and then
mechanically applied across the tree.

**Read pattern (no payment filter):**

```ts
.from('event_participants')
.select(
  'user_id, ..., payment:event_participant_payments(payment_status, payment_intent_id), division:event_divisions!inner(event_id)',
)
.eq('role', 'attendee')
.eq('division.event_id', eventId);
// then: r.payment?.payment_status ?? 'pending'
```

The `?? 'pending'` preserves the bridge's `coalesce` semantics —
free-RSVP rows that never had a payment row stay "pending" to
callers, not `null`.

**Read pattern (filter on a payment column):** promote the embed to
`!inner` so PostgREST can use it as a filter:

```ts
.select('..., payment:event_participant_payments!inner(payment_status), ...')
.eq('payment.payment_status', 'paid')
```

**Write pattern (payment field update):** keyed by the payment-side
column when available (`checkout_session_id` / `payment_intent_id`
both live on `event_participant_payments` now); otherwise resolve
`participant_id` via a `select`, then `upsert` keyed by
`participant_id` (`onConflict: 'participant_id'`).

**Write pattern (insert pending attendee — the hardest case):** in
[checkout-actions.ts](../../apps/web/src/app/events/[id]/checkout-actions.ts)
the bridge `INSTEAD OF INSERT` trigger used to do two inserts
(participant + payment) in one SQL statement. The retarget does
them as two PostgREST calls, with explicit cleanup:

1. Insert `event_participants` row → if `23505` duplicate, fetch
   existing `(id, payment_status)` instead. If existing status is
   `paid`, abort with `already`.
2. Upsert `event_participant_payments` row keyed by
   `participant_id`. If this fails, delete the participant so the
   capacity reservation doesn't leak.
3. Create the Stripe Checkout session. If Stripe throws, again
   delete the participant (cascade kills the payment row).
4. Stamp `checkout_session_id` onto the payment row by
   `participant_id`.

The orphan window between steps 1 and 2 is intentional — we own
the cleanup. Atomicity could come back with a SECURITY INVOKER RPC
if it ever bites, but Bundle B is a better forcing function
(if the views go away and the trigger pattern matters, the RPC
materialises then).

**Delete pattern:** every `.from('event_attendees').delete()...`
previously keyed by `(division_id, user_id)`, `payment_intent_id`,
or `checkout_session_id` now resolves `participant_id` first and
deletes from `event_participants` (the payment row cascades).

**Sites touched** (in order of risk, low → high):

- Reads: [pricing-lock.ts](../../apps/web/src/lib/pricing-lock.ts),
  [refund-ticket.ts](../../apps/web/src/lib/refund-ticket.ts),
  [profile/billing/analytics/page.tsx](../../apps/web/src/app/profile/billing/analytics/page.tsx),
  [attendees.csv route](../../apps/web/src/app/api/events/[id]/attendees.csv/route.ts),
  [reminders cron](../../apps/web/src/app/api/notifications/reminders/route.ts),
  [load-event-detail.ts loaders](../../apps/web/src/app/events/[id]/_loaders/load-event-detail.ts),
  [edit/page.tsx](../../apps/web/src/app/events/[id]/edit/page.tsx),
  [broadcast-actions.ts](../../apps/web/src/app/events/[id]/broadcast-actions.ts),
  [edit/cancel-actions.ts](../../apps/web/src/app/events/[id]/edit/cancel-actions.ts),
  [edit/actions.ts notify](../../apps/web/src/app/events/[id]/edit/actions.ts).
- Writes: [checkout-actions.ts](../../apps/web/src/app/events/[id]/checkout-actions.ts),
  [Stripe webhook](../../apps/web/src/app/api/webhooks/stripe/route.ts)
  (paid / expired / payment_failed / refunded paths),
  [checkout/success](../../apps/web/src/app/events/[id]/checkout/success/route.ts),
  [checkout/cancel](../../apps/web/src/app/events/[id]/checkout/cancel/route.ts),
  [manage-payments-actions.ts](../../apps/web/src/app/events/[id]/manage-payments-actions.ts)
  (host cash mark-paid is now an `upsert` to
  `event_participant_payments`).
- Infra repo:
  [supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts)
  — `findById`, `save` (attendee + free-agent delta sync),
  `getDetail`, `searchFollowingFeed`, `attachFreeAgentToDivision`.
- Realtime: comment cleanup in
  [use-event-attendees.ts](../../apps/web/src/hooks/use-event-attendees.ts)
  — the hook was already subscribing to `event_participants`
  directly (the realtime publication can't include views), only
  the stale "post-collapse" comment needed updating.
- Type stub: added `event_participants` +
  `event_participant_payments` table entries to
  [packages/supabase/src/database.types.ts](../../packages/supabase/src/database.types.ts).
  Docker isn't running locally so the file is hand-patched per the
  repo memory's `supabase-types-stub.md` convention; Bundle B's
  migration regenerates this cleanly.

## Patterns surfaced

- **Bridge views hide which table owns a field.** When
  `payment_status` and `reminder_24h_sent_at` show up in the same
  `SELECT *`, writes start grouping fields by _what the action
  does_ (`mark sent` / `mark paid`) instead of _what table owns
  them_. The retarget makes the seam visible, and the resulting
  code reads more honestly: reminder updates go to
  `event_participants`, payment updates go to
  `event_participant_payments`, end of story.
- **`as never as` casts at the Supabase boundary are still the
  smell.** This bundle had to add two table entries by hand because
  the generated types are stale (Docker off locally). Every
  `update({ … } as never)` site is a place where the new column
  names slipped past the type system silently. Bundle B will let
  these regenerate from real schema; the durable takeaway is the
  one already in
  [event-data-model.md](../audits/event-data-model.md) — prefer
  typed `.from('t').insert<RowType>(…)` payloads where the
  adapter shape is stable.
- **PostgREST embeds are the natural shape for "header + side
  table" reads.** `payment:event_participant_payments(...)` reads
  more cleanly than the alternative (two queries + a manual join
  in app code) and Supabase's typed return shape preserves
  optionality (`payment: { … } | null`) so the `?? 'pending'`
  default at the boundary is explicit instead of buried in a
  view's `coalesce`.
- **Atomicity inversion.** The bridge trigger used to do
  participant + payment inserts in one SQL statement. The retarget
  splits them into two PostgREST calls; the second-write-failed
  branch needs an explicit cleanup. For a single payment table
  this is fine — the cleanup is one DELETE — but it's worth
  noticing: any future "this is now two tables behind one trigger"
  refactor inherits the same orphan-window obligation.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — 15/15
typecheck, lint at the existing 3 warnings (unrelated scoreboard
effect-setState warnings), 50 web + 179 domain/application tests
passing, 8/8 build.

## Follow-ups

- **Bundle B (next):** drop the `event_attendees` /
  `event_free_agents` views, their `INSTEAD OF` triggers, and the
  matching entries in the supabase types stub. No caller
  references the views any more after this bundle — Bundle B is a
  migration-only PR.
- Carried unchanged from prior entries:
  `EventTeamRegistration.forfeitedAt` wiring, `LeagueSchedule`
  RPC, bracket-reader `source='roster'` filter loosening.
