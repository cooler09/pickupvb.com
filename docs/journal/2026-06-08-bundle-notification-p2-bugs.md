# 2026-06-08 — Notifications re-audit fixes (P2 + P3 backlog)

Follows the 2026-06-07 whole-site notifications re-audit
([notifications-messaging.md](../audits/notifications-messaging.md)). This bundle
clears the actionable backlog: two new correctness/reliability bugs (P2 #7/#8),
the three new P3s, and the previously-deferred P2 #3 (email bounce/complaint
suppression). Quad-green (typecheck/lint/test/build), uncommitted. What's left is
ops-config (cron/VAPID/Resend-webhook) + the older nice-to-have P3s.

## P2 #8 — Notification times rendered in server UTC

### Root cause

`formatStart` / `formatDate` in
[templates.ts](../../packages/notifications/src/templates.ts) called
`new Date(iso).toLocaleString('en-US', { … })` with **no `timeZone` option**, so
they formatted in the Node runtime's zone — **UTC on Vercel**. Every email / push
/ SMS / bell line that shows a time ("Tomorrow at …", "Starting soon …", signup
confirmations, league kickoffs) read hours off for everyone not in UTC: a 7 PM ET
event rendered "12:00 AM". The data to fix it already existed — `events.time_zone`
— but was never threaded into the notification payloads, and the formatters had no
parameter for it.

### Fix

Two layers:

1. **Formatter default.** `formatStart(iso, tz?)` / `formatDate(iso, tz?)` now
   pass `timeZone: tz || DEFAULT_TIME_ZONE`, with
   `DEFAULT_TIME_ZONE = 'America/New_York'`. PickupVB is a Virginia Beach
   community, so even a send site that supplies no zone now renders ET instead of
   UTC — that alone corrects ~all notifications.
2. **Per-event zone threaded.** An optional `timeZone?: string` was added to the
   six event-time payloads ([kinds.ts](../../packages/notifications/src/kinds.ts))
   and selected + passed from every build site: signup-confirmed + waitlist-promote
   ([rsvp-actions.ts](../../apps/web/src/app/events/[id]/rsvp-actions.ts)), cancel
   ([cancel-actions.ts](../../apps/web/src/app/events/[id]/edit/cancel-actions.ts),
   via the `detail.timeZone` already on the read model), the event-reminder sweep
   ([route.ts](../../apps/web/src/app/api/notifications/reminders/route.ts) +
   `ReminderEvent.time_zone`), and the league-reminder sweep
   ([route.ts](../../apps/web/src/app/api/notifications/league-reminders/route.ts),
   an event→zone map → `DueFixture.timeZone`).

Pinned by a new [templates.test.ts](../../packages/notifications/src/templates.test.ts):
a fixed summer instant renders 7:30 PM in ET / 4:30 PM in `America/Los_Angeles`,
never the 11:30 PM UTC value. **Gotcha:** modern Node's `Intl` separates time and
meridiem with a narrow no-break space (U+202F), not an ASCII space — assert on the
`7:30` hour:minute, not the literal `"7:30 PM"`.

`notification_preferences.timezone` stays unused: an event's time is correctly the
event's zone, not the viewer's. A recipient-zone override is a separate (open) P3.

## P2 #7 — Outbox rows could strand in `sending` forever

### Root cause

[`claimBatch`](../../packages/infrastructure/src/supabase-notification-outbox-repository.ts)
flipped due `pending` rows to `sending`, then the worker processed them to a
terminal state. But the claim only ever selected `status = 'pending'` — nothing
re-claimed a `sending` row. So a worker death between claim and terminal write
(the 60s `maxDuration` hard-kill mid-batch — a batch of 50 is flipped to `sending`
up front and `DRAIN_BUDGET_MS` only breaks _between_ batches — an unhandled throw,
or a cold-stop) orphaned every claimed-but-unprocessed row permanently: never
delivered, never retried, never purged. The drain index even included `sending`,
signalling the intent to recover them, but no query did.

### Fix — lease-based reclaim (no migration)

`claimBatch` now (1) widens the filter to `status IN ('pending','sending') AND
scheduled_for <= now()` and (2) stamps `scheduled_for = now() + 5 min` (a lease)
on the flip. A row actively in delivery carries a future `scheduled_for`, so a
concurrent worker can't re-grab it; if the worker dies, the lease lapses and the
next sweep re-claims the orphaned `sending` row. The 5-min lease ≫ the worker's
60s ceiling, so an in-flight row is never double-claimed. `markFailed` still
overwrites `scheduled_for` with the backoff time, so retries are unaffected.

**Why reuse `scheduled_for` instead of adding `updated_at`:** the table has no
`updated_at`, and the lease encodes "claimed-at + timeout" directly in the column
the claim already filters on — so the fix is a single adapter change with no
schema migration. A perpetually-timing-out row keeps its `attempts` (only
`markFailed` increments), so it re-leases rather than burning retries — acceptable,
since a constant timeout is a systemic fault, not a poison row.

### Rejected alternative

A separate reaper step at the top of the worker GET resetting stale `sending` rows
to `pending`. It needs a "claimed at" timestamp to detect staleness — i.e. the
`updated_at` column we were avoiding — and adds a second query + round-trip per
wake. The lease folds recovery into the existing claim for free.

## Verification

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green (283 web tests

- the new template suite; lint clean apart from pre-existing theme-toggle
  warnings). The reaper is a thin Supabase adapter with no in-repo unit harness
  (consistent with the other outbox SQL) — it's exercised by the
  `notification-broadcast-drain` e2e on deploy, not a fake-client test.

## P3 follow-ups — also fixed this pass

The three P3s the re-audit raised landed in the same bundle:

1. **Per-category prefs were read but unsettable.** `channelAllowedByPrefs`
   already honored `channel_overrides[category][channel]`, but no UI wrote it —
   so an entire dispatch tier was dark. Added a **"Fine-tune by type"** matrix to
   the settings page. The honest part is
   [categories.ts](../../apps/web/src/app/profile/notifications/categories.ts):
   each category shows only the channels its kinds actually send on, derived from
   the kind registry (`KIND_CATEGORY` × `KIND_DEFAULT_CHANNELS`) — an override can
   only _subtract_ from the master, so offering "Email" for an in-app-only
   category would be a dead control. The page + the action share that helper so
   both iterate the same (category, channel) set (a checkbox only POSTs when
   checked, so the writer must know the full set to record the unchecked ones as
   `false`). Only `false` entries are stored, matching what dispatch reads. The
   settings port (`find` / `upsertChannels`) gained the `channelOverrides` field;
   `upsertChannels` writes it only when supplied, so a master-only save can't
   clobber stored overrides.
2. **Bell badge zeroed with > 20 unread.** The popover marked only its ≤ 20
   loaded rows read, then `setUnread(0)` unconditionally → badge flickered
   50 → 0 → 30. Now it marks **every** unread row for the user set-wide
   (RLS-scoped `eq('user_id').is('read_at', null)`), so badge and DB agree.
3. **Worker counted skipped pushes as sent.** `drainOneBatch` inferred `sent` vs
   `skipped` from `row.channel`, so a `push` row with no live subscription
   inflated the `sent` tally. `processRow` now returns `'sent' | 'skipped'` and
   the caller tallies from that.

## P2 #3 — Email bounce/complaint suppression

### Root cause

The Resend adapter flagged hard-bounce handling as `TBD`: there was no webhook
and no suppression list, so a dead or complaining address was re-mailed on every
future notification — degrading sender reputation and risking domain throttling.

### Fix — sink + webhook + pre-send check

Three pieces, each on the service-role path (the writer and reader are both
session-less):

1. **Sink.** `email_suppressions` table (address PK, `reason` ∈
   {bounced, complained}) behind an `EmailSuppressionPort` /
   `SupabaseEmailSuppressionRepository`. Addresses lowercased on both sides so
   membership is case-insensitive.
2. **Webhook.** `/api/webhooks/resend` verifies the Svix signature by hand —
   HMAC-SHA256 over `${id}.${timestamp}.${body}` keyed by the decoded
   `whsec_…` secret, plus a 5-min replay window — rather than adding the `svix`
   SDK (mirrors the hand-rolled Resend _send_ adapter). It suppresses on a
   **permanent bounce** or **complaint**; a _transient_ (soft) bounce is left to
   the outbox retry/backoff. Classification is a pure function over the port, so
   it's unit-tested without Supabase.
3. **Pre-send check.** The worker pre-fetches suppressed addresses for the
   batch's email rows (one query, like the push-subscription pre-fetch) and skips
   a suppressed row (`status → skipped`, reason `email-suppressed`) before the
   Resend POST.

### Why hand-rolled signature verification

The only consumer is this one route; the `svix` SDK is a dependency + bundle cost
for ~20 lines of HMAC. The repo already hand-rolls the Resend _send_ path for the
same reason, so verification matches that grain. Pinned by
`resend-verify.test.ts` (valid / tampered-body / wrong-secret / stale-timestamp /
missing-header).

### Ops-gated (like cron + VAPID)

The code ships inert until `RESEND_WEBHOOK_SECRET` is set and a Resend webhook is
pointed at `/api/webhooks/resend` for `email.bounced` + `email.complained` —
until then the route 503s and nothing is suppressed (sends unaffected). The
migration applies on deploy; `database.types.ts` was hand-edited for the new
table and regenerates on the next `gen:types`.

## Follow-ups (still open from the audit)

Older P3s untouched (quiet hours, SMS adapter, digests, push analytics,
mark-read-after-send, in-app chat dedup, the cross-channel `enqueue` atomicity
note). Plus the standing ops items — P1 #1 dev cron/kick seeding, P1 #2 verify
prod VAPID, and the P2 #3 webhook config (`RESEND_WEBHOOK_SECRET` + the Resend
dashboard endpoint).
