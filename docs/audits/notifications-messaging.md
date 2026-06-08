# Notifications & messaging audit (push · email · in-app · chat)

Scope: the three delivery channels behind every user-facing alert —
**browser push**, **transactional email** (Resend), and the **in-app bell** —
plus the **chat/DM engine** (ADR 0028) that rides on top of them. Triggered by
a report that "push notifications don't seem to be working."

Architecture references: ADR 0022 (outbox port), 0026 (event-driven delivery),
0027 (Realtime broadcast bell), 0028 (chat). Pipeline:

```
notify(kind,user,payload)
  → dispatch(): prefs ∩ kind channels   (lib/notify.ts)
      ├─ in_app → notifications table → Realtime bell        (immediate)
      └─ email/push/sms → notification_outbox → cron worker  (/api/notifications/worker)
                              → Resend / web-push
```

---

## Status

**2026-06-04 — initial audit + P1 bundle shipped (uncommitted).**
**2026-06-05 — root cause CONFIRMED by live outbox inspection (see P1 #1).**
**2026-06-07 — full re-audit (whole-site sweep). All notification _kinds_ now
have ≥1 live trigger (P2 #2 "dead kinds" fully closed). Five new findings:
two reliability/correctness bugs (P2 #7 stranded `sending` rows, P2 #8 times
render in server UTC) + three P3s (no per-category prefs UI, bell mark-read
miscounts > 20 unread, worker metrics conflate skipped push as sent). Details
below.**

The system is well-architected; the "push doesn't work" symptom is
**configuration + coverage**, not broken code. Root causes, in order:

1. **Vercel Cron runs only on _production_ deployments — and the dev `pg_net`
   kick is unseeded — so nothing drains the dev outbox.** CONFIRMED 2026-06-05:
   a service-role query of dev `notification_outbox` showed **25 rows, every one
   `pending` / `attempts=0`, push AND email, hours old** — including the
   `chat.message.received` push the user reported. The in-app bell works because
   it bypasses the outbox; everything routed through the worker is stranded.
   (P1 #1)
2. **VAPID is actually configured on dev** (test-push delivered to Android, and
   push rows enqueue fine) — so the original "likely unset" worry is resolved
   for dev; the remaining action is verifying prod. (P1 #2)
3. **The natural test action didn't push.** `event.signup.confirmed` and
   `event.reminder.24h` were `email + in_app` only — a user "testing push" by
   joining an event got nothing. (P2 #1, fixed)

Shipped this bundle: a **`/api/notifications/test-push` self-test** (in-request
`sendWebPush`, bypasses outbox/cron — works on preview), a **PWA manifest +
icons** (sw.js referenced non-existent icons; iOS push was impossible), the
**chat-message notification** (DMs were silent on every channel — ADR 0028
gap), push added to the two high-value kinds, and a correctness fix so **push
is never force-sent for transactional kinds** (it has its own opt-in). See the
remediation log.

---

## P1 — ship-blocking

### P1 #1 — Nothing drains the dev outbox (cron is production-only + kick unseeded) — OPEN (ops), CONFIRMED 2026-06-05

Vercel only schedules `crons[]` from `vercel.json` on the **production**
deployment, so on the `develop`-branch Preview (`dev.pickupvb.com`) the worker
is never woken on a schedule. The only other drain path — the `pg_net` kick
trigger (ADR 0026) — is **inert until two Vault secrets are seeded** in that
environment's Supabase project (the trigger `null`-returns when `notif_worker_url`
is absent). On dev neither is happening, so the queue grows forever. **Live proof
(2026-06-05):** dev `notification_outbox` held 25 rows, all `pending`/`attempts=0`,
push + email, the oldest hours old.

**Fix — seed the kick in the _dev_ Supabase project** (SQL editor; one-time, per
the migration preamble). `notif_worker_cron_secret` must equal the **deployed
dev** `CRON_SECRET` (Vercel → dev/Preview env), not the local `.env.dev` value:

```sql
select vault.create_secret('https://dev.pickupvb.com/api/notifications/worker', 'notif_worker_url');
select vault.create_secret('<deployed dev CRON_SECRET>', 'notif_worker_cron_secret');
```

After seeding, any new enqueue kicks the worker, which **drains the whole
backlog per wake** — so one fresh message/event clears all 25 stranded rows.
Do the same with the prod URL + prod `CRON_SECRET` on the prod project if you
want sub-5-min delivery there (prod already drains every 5 min via cron).
Files: [vercel.json](../../apps/web/vercel.json),
[20260822000000_event_driven_notification_delivery.sql](../../supabase/migrations/20260822000000_event_driven_notification_delivery.sql).

### P1 #2 — VAPID per Vercel environment — RESOLVED for dev (verify prod)

`.env.dev` originally carried no `VAPID_*`. Dev deploy is now confirmed
configured (test-push delivered to Android; push rows enqueue), so the
"not configured" failure mode is closed for dev. **Remaining:** confirm all four
(`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`VAPID_SUBJECT`) are set on **Production** too. A keypair was generated into the
local (gitignored) `.env.dev` for local runs.
([web-push.ts:31-40](../../apps/web/src/lib/web-push.ts#L31-L40))

### P1 #3 — Chat messages notified the recipient on no channel — FIXED

Sending a DM/room message fired nothing — no kind existed, `SendMessageHandler`
and `sendChatMessage` never called `notify()`. Recipients only found messages by
opening `/messages`; the header badge isn't live either (P2 #5). **Fixed** for
DMs: new `chat.message.received` kind (push + in_app), dispatched from
[chat-actions.ts](../../apps/web/src/app/_actions/chat-actions.ts) via
[notify-chat.ts](../../apps/web/src/lib/notify-chat.ts) (coalesced so a
back-and-forth pings once). Room-message pings deferred (P2 #6).

### P1 #4 — Missing PWA manifest + notification icons — FIXED

No `manifest.json`; `sw.js` referenced `/icon-192.png` + `/badge-72.png` that
didn't exist (icon-less notifications on Android/desktop; iOS push impossible —
iOS only exposes Push to an installed PWA). **Fixed:** generated brand icons
(`public/icon-192.png`, `icon-512.png`, `badge-72.png`, `src/app/apple-icon.png`),
added `public/manifest.webmanifest`, linked `manifest` + `appleWebApp` +
`themeColor` in [layout.tsx](../../apps/web/src/app/layout.tsx), and added iOS
"Add to Home Screen" guidance to
[push-subscribe-button.tsx](../../apps/web/src/components/push-subscribe-button.tsx).

---

## P2 — next-sprint hardening

### P2 #1 — High-value kinds omitted push — FIXED

`event.signup.confirmed` and `event.reminder.24h` were `email + in_app`. Added
`push` to both ([kinds.ts](../../packages/notifications/src/kinds.ts)). Paired
with the correctness fix below so transactional push still honors the opt-in.

### P2 #2 — Three notification kinds defined but never triggered — ✅ resolved (all wired by 2026-06-07)

`event.waitlist.promoted` (waitlist feature itself unimplemented),
`host.stripe.action_required`, and `social.follow.new` had kinds + templates
but **zero `notify()` call sites**.

- **`social.follow.new` — wired.** `notifyNewFollower`
  ([notify-follow.ts](../../apps/web/src/lib/notify-follow.ts)) fires from
  `addFriend` ([friends/actions.ts](../../apps/web/src/app/friends/actions.ts))
  via `after()`. Coalesced on the unread-bell href so a follow/unfollow churn
  pings once.
- **`host.stripe.action_required` — wired.** `maybeNotifyStripeActionRequired`
  ([webhooks/connect.ts](../../apps/web/src/lib/webhooks/connect.ts)) fires from
  `handleAccountUpdated` when `requirements.past_due` / `currently_due` /
  `disabled_reason` is set. Email/push dedup on a requirement-signature
  idempotency key; in_app coalesces on the unread bell.
- **`event.waitlist.promoted` — wired (2026-06-06).** Now fired from the web
  `leaveEvent` action via `LeaveEventHandler`'s returned `promotedUserId` once the
  capacity-waitlist feature landed (ADR 0036). With it, **every kind in the
  registry has ≥ 1 live trigger** — this finding is fully closed.

Tests: [notify-follow.test.ts](../../apps/web/src/lib/notify-follow.test.ts),
[webhooks/connect.test.ts](../../apps/web/src/lib/webhooks/connect.test.ts).

### P2 #3 — No email bounce/complaint handling — OPEN

[email-resend.ts:8-9](../../apps/web/src/lib/email-resend.ts#L8-L9) flags
hard-bounce handling as `TBD`; there's no Resend webhook and no suppression
list, so a dead address is retried and re-sent indefinitely. **Fix:** add a
Resend webhook route that records `bounced`/`complained` and skips future sends
to that address.

### P2 #4 — No one-click `List-Unsubscribe` — ✅ resolved 2026-06-06

Non-transactional email now carries `List-Unsubscribe` +
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). The worker
([worker/route.ts](../../apps/web/src/app/api/notifications/worker/route.ts))
mints a per-user HMAC token ([unsubscribe-token.ts](../../apps/web/src/lib/unsubscribe-token.ts),
keyed on the existing `CRON_SECRET` — no new ops config) for any non-transactional
kind and passes the URL to [email-resend.ts](../../apps/web/src/lib/email-resend.ts);
transactional mail (receipts/account events) gets no header (CAN-SPAM). The
target [api/unsubscribe/route.ts](../../apps/web/src/app/api/unsubscribe/route.ts)
verifies the token (no session) and flips `email_enabled = false` on the admin
client — silencing non-transactional email while the bell + transactional mail
stay on. To thread the recipient, `OutboxRecord` gained `userId` (claimed in
`claimBatch`). Tests: `unsubscribe-token.test.ts`, `email-resend.test.ts`.
Degrades off when `CRON_SECRET` is unset (header simply omitted).

### P2 #5 — Header unread badge isn't live — ✅ resolved 2026-06-06

[messages-nav-link.tsx](../../apps/web/src/components/messages-nav-link.tsx) is
now a client component that increments live on each `chat.message.received`
INSERT. Rather than a new `inbox:{uid}` topic, it reuses the bell's existing
`notifications:<userId>` Broadcast topic (ADR 0027) — the DM ping already flows
there. To avoid a second join to the same private topic (the RLS topic is fixed,
so a duplicate join is rejected), the channel was extracted into a ref-counted
shared subscriber [subscribe-notifications.ts](../../apps/web/src/lib/subscribe-notifications.ts)
that both the bell and the badge consume. The live increment is an approximation
between navigations (coalesced ping ≈ one per newly-active conversation); the
exact count re-syncs from `count_unread_conversations` on the next navigation.
**Realtime delivery itself is deploy-gated to verify** (two sessions, deployed
target). Rooms join the live signal once P2 #6 lands.

### P2 #6 — Room (team/event/group) messages don't notify — ✅ resolved 2026-06-06

[notify-chat.ts](../../apps/web/src/lib/notify-chat.ts) now branches on kind:
rooms resolve recipients via the new `list_room_recipients` RPC
([20260916000000](../../supabase/migrations/20260916000000_list_room_recipients.sql)),
a SECURITY DEFINER set-returning function modeled on `can_access_conversation`
(single source of truth for membership) that excludes the sender + anyone who
muted the room. The coalesce/throttle is now a single batched lookup over the
recipient set (a busy room pings each person once), and the deep-link is uniform
`/messages/<id>` for all kinds (the route renders rooms too). Channels follow the
kind's map — push stays opt-in (P1 #2 fix). Tests in
[notify-chat.test.ts](../../apps/web/src/lib/notify-chat.test.ts) cover the room
fan-out + per-recipient coalesce. **Deploy-gated:** the RPC migration + the
hand-edited `database.types.ts` entry need `gen:types` against the real schema,
and the fan-out can only be exercised against a deployed DB.

### P2 #7 — Outbox rows can strand in `sending` forever (no reaper) — OPEN

[`claimBatch`](../../packages/infrastructure/src/supabase-notification-outbox-repository.ts#L108-L128)
flips due `pending` rows to `sending`, then
[the worker](../../apps/web/src/app/api/notifications/worker/route.ts#L155-L200)
processes them one-by-one to a terminal state. But the claim query **only ever
selects `status = 'pending'`** — nothing re-claims a `sending` row. So if the
function dies between claim and terminal write — the 60s `maxDuration` hard kill
mid-batch (a batch of 50 is all flipped to `sending` up front, and
`DRAIN_BUDGET_MS` only breaks _between_ batches, never mid-batch), an
unhandled throw, or a Vercel cold-stop — every claimed-but-unprocessed row is
**orphaned in `sending` permanently**: never delivered, never retried, and not
purged (`purgeTerminal` only deletes `sent`/`skipped`, `purgeFailed` only
`failed`). The `notification_outbox_drain_idx` even indexes `sending`, signalling
the intent to recover them, but no query does. Silent in dev (low volume); a
broadcast burst or a slow Resend/web-push window on prod is where it bites.

**Fix:** add a stale-claim reaper. Either (a) widen `claimBatch` to also re-claim
`status = 'sending' AND updated_at < now() - interval '5 min'` (add an
`updated_at` touch on the `sending` flip), or (b) a small step at the top of the
worker GET that resets `sending` rows older than a timeout back to `pending`
(attempts unchanged, so the existing backoff still applies). Option (a) is fewer
moving parts. Pin it with a sweep test that leaves a row `sending` and asserts the
next run re-claims it.

### P2 #8 — Notification times render in the server's UTC, not the event's zone — OPEN

`formatStart` / `formatDate` in
[templates.ts](../../packages/notifications/src/templates.ts#L45-L69) call
`new Date(iso).toLocaleString('en-US', { … })` **with no `timeZone` option**, so
they format in the Node runtime's zone — **UTC on Vercel**. Every email / push /
SMS / bell line that shows a time ("Tomorrow at …", "Starting soon …", signup
confirmations, league-match kickoff, account-deletion date) is wrong for everyone
not in UTC: a 7 PM ET event renders **"12:00 AM"**. The data to fix it already
exists and is simply never threaded — `events.time_zone` (e.g.
`'America/New_York'`) is a column on the row, and the
[reminder sweep select](../../apps/web/src/app/api/notifications/reminders/route.ts#L44)

- the [signup-confirmed read](../../apps/web/src/app/events/[id]/rsvp-actions.ts#L82-L105)
- [cancel-actions](../../apps/web/src/app/events/[id]/edit/cancel-actions.ts#L100-L114)
  all omit it from both the SQL select and the `NotificationPayload`.
  (`notification_preferences.timezone` exists too but is likewise unused — P3.)

**Fix:** add an optional `timeZone` to the event-bearing payloads, select
`time_zone` everywhere an event notification is built, and pass it through
`formatStart(iso, tz)` → `toLocaleString('en-US', { …, timeZone: tz ?? 'America/New_York' })`.
Fall back to the event zone first, then a sensible default. A template unit test
asserting a fixed ISO + `'America/New_York'` renders the ET wall-clock pins it.

---

## P3 — nice-to-have

- **Quiet hours unused.** `quiet_hours_start/end` + `timezone` exist on
  `notification_preferences` but dispatch never honors them. Gate non-urgent
  sends or defer `scheduled_for`.
- **SMS adapter stubbed.** Worker marks `sms` rows `skipped`
  ([worker/route.ts:78-81](../../apps/web/src/app/api/notifications/worker/route.ts#L78-L81)).
  No Twilio, no STOP webhook. Fine until SMS is a product need.
- **In-app chat dedup.** DM bell coalesces via an unread-window check; once
  read, every subsequent message inserts a row. Acceptable (feed semantics);
  revisit if noisy.
- **Mark-read-after-send.** A thread you just posted in can show unread in the
  inbox until the next open (ADR 0028 follow-up).
- **No push analytics.** No subscription-rate / delivery-success metrics to
  PostHog.
- **No digest emails.**
- **Per-category prefs are read but unsettable.** `dispatch` honors
  `channel_overrides[category][channel]`
  ([notify.ts:56,73](../../apps/web/src/lib/notify.ts#L56-L73)), but the prefs
  page ([profile/notifications/page.tsx](../../apps/web/src/app/profile/notifications/page.tsx))
  only renders the three master toggles (email / in-app / push) — no UI ever
  writes `channel_overrides`, `quiet_hours_*`, or the SMS fields, and
  `updateNotificationPreferences` only persists the three masters. So a user
  can't, say, mute "social" while keeping "event_reminders": a whole tier of the
  data model + dispatch logic is dark. Either add the granular UI or drop the
  unsettable columns to avoid a "supported but impossible" gap.
- **Bell "mark all read" zeroes the badge even with > 20 unread.** The popover
  holds ≤ 20 rows; on open it marks only those read in the DB and then
  unconditionally `setUnread(0)`
  ([notification-bell.tsx:76-91](../../apps/web/src/components/notification-bell.tsx#L76-L91)).
  A user with 50 unread sees the badge drop 50 → 0 while 30 rows stay unread in
  the DB; the next navigation re-syncs the badge back to 30 (a flicker, not data
  loss). Fix: decrement by the count actually marked, or mark-all-read server-side
  (`update … where user_id = me and read_at is null`) so the badge and the DB
  agree.
- **Worker metrics conflate skipped pushes with sent.** In `drainOneBatch` a
  `push` row counts toward `sent` even when `processRow` ended in `markSkipped`
  (`no-push-subscriptions` / `all-subscriptions-gone`)
  ([worker/route.ts:174-178](../../apps/web/src/app/api/notifications/worker/route.ts#L174-L178)).
  Observability only (the response JSON over-reports delivery), but it hides the
  "user has push enabled but no live subscription" failure mode. Have `processRow`
  return its outcome and tally from that instead of inferring from `channel`.
- **Batch `enqueue` is atomic across channels.** A fan-out builds one multi-row
  insert ([outbox repo `enqueue`](../../packages/infrastructure/src/supabase-notification-outbox-repository.ts#L90-L104));
  if any one row trips the `idempotency_key` unique constraint (a webhook retry of
  a keyed kind), the **whole** insert aborts and `notify` swallows it — but the
  `in_app` row was already inserted separately and carries no idempotency key, so
  a retry can double the bell row while dropping the email/push. Rare and
  low-harm; note it if a retry-heavy kind ever shows duplicate bells.

---

## Remediation log

**2026-06-04 — P1 push/chat bundle (uncommitted).**

- Push self-test: [api/notifications/test-push/route.ts](../../apps/web/src/app/api/notifications/test-push/route.ts)
  - [push-test-button.tsx](../../apps/web/src/components/push-test-button.tsx)
    on [/profile/notifications](../../apps/web/src/app/profile/notifications/page.tsx).
- PWA: `public/manifest.webmanifest` + generated icons; `manifest`/`appleWebApp`/
  `themeColor` in [layout.tsx](../../apps/web/src/app/layout.tsx); iOS guidance
  in [push-subscribe-button.tsx](../../apps/web/src/components/push-subscribe-button.tsx).
- Chat notify (DM): `chat.message.received` kind + `messages` category +
  templates ([kinds.ts](../../packages/notifications/src/kinds.ts),
  [templates.ts](../../packages/notifications/src/templates.ts)),
  [notify-chat.ts](../../apps/web/src/lib/notify-chat.ts), wired via `after()`
  in [chat-actions.ts](../../apps/web/src/app/_actions/chat-actions.ts).
- Coverage: `push` added to `event.signup.confirmed` + `event.reminder.24h`.
- Correctness: `channelAllowedByPrefs` in
  [notify.ts](../../apps/web/src/lib/notify.ts) now treats **push as always
  opt-in** (never force-sent by transactional kinds — push has its own browser
  consent model). Pinned by [notify.test.ts](../../apps/web/src/lib/notify.test.ts)
  - [notify-chat.test.ts](../../apps/web/src/lib/notify-chat.test.ts).
- Env: VAPID keypair generated into local `.env.dev`; `.env.example` now notes
  the per-environment Vercel requirement.

**Open backlog:** P1 #1 (preview cron), P1 #2 (Vercel VAPID — ops), P2 #2/#3/#4/#5/#6, all P3.
