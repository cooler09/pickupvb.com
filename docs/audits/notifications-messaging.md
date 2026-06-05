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

The system is well-architected; the "push doesn't work" symptom is
**configuration + coverage**, not broken code. Root causes, in order:

1. **Vercel Cron runs only on _production_ deployments.** `dev.pickupvb.com` is
   a Preview deploy, so the every-5-min `/api/notifications/worker` drain
   **never fires there** — preview delivery depends entirely on the seeded
   `pg_net` kick (ADR 0026), which is out-of-band per environment. A push
   enqueued on dev can sit in the outbox forever. (P1 #1)
2. **VAPID env vars likely unset on the deployed envs.** `.env.dev` had none;
   if `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is missing on a deploy, the enable-push
   button renders "not configured" and nobody can subscribe. (P1 #2)
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

### P1 #1 — Outbox worker never drains on preview/dev (cron is production-only) — OPEN (ops)

Vercel only schedules `crons[]` from `vercel.json` on the **production**
deployment. dev.pickupvb.com is a `develop`-branch Preview, so the worker is
never invoked on a schedule there; only the DB `pg_net` kick can drain it, and
that kick needs Vault secrets seeded for the preview environment (ADR 0026).
**Fix:** seed the kick secret for Preview, _or_ accept that dev push/email is
"kick-only" and use the new test-push button to validate delivery (it sends
in-request, no worker needed). Document which. File:
[apps/web/vercel.json](../../apps/web/vercel.json),
[supabase/migrations/20260822000000_event_driven_notification_delivery.sql](../../supabase/migrations/20260822000000_event_driven_notification_delivery.sql).

### P1 #2 — VAPID keys must be set per Vercel environment — OPEN (ops)

`.env.dev` carried no `VAPID_*`. If unset on a deploy, `configure()` returns
false ([web-push.ts:31-40](../../apps/web/src/lib/web-push.ts#L31-L40)) and the
client gets a null public key → "not supported (server VAPID key not
configured)". **Fix:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` in Vercel for **both**
Production and Preview, then redeploy. A keypair was generated into the local
(gitignored) `.env.dev`; copy those four values into Vercel. Verify per-device
with the test-push button.

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

### P2 #2 — Three notification kinds defined but never triggered — OPEN

`event.waitlist.promoted` (waitlist feature itself unimplemented),
`host.stripe.action_required`, and `social.follow.new` have kinds + templates
but **zero `notify()` call sites**. Either wire them at their event source or
remove to avoid dead config. Files: trigger sites absent;
[kinds.ts](../../packages/notifications/src/kinds.ts),
[templates.ts](../../packages/notifications/src/templates.ts).

### P2 #3 — No email bounce/complaint handling — OPEN

[email-resend.ts:8-9](../../apps/web/src/lib/email-resend.ts#L8-L9) flags
hard-bounce handling as `TBD`; there's no Resend webhook and no suppression
list, so a dead address is retried and re-sent indefinitely. **Fix:** add a
Resend webhook route that records `bounced`/`complained` and skips future sends
to that address.

### P2 #4 — No one-click `List-Unsubscribe` — OPEN

Emails link to `/profile/notifications` but carry no `List-Unsubscribe` /
`List-Unsubscribe-Post` header (gmail/outlook one-click). **Fix:** add the
headers in [email-resend.ts](../../apps/web/src/lib/email-resend.ts) pointing at
a tokenized unsubscribe route.

### P2 #5 — Header unread badge isn't live — OPEN

[messages-nav-link.tsx](../../apps/web/src/components/messages-nav-link.tsx) is
server-rendered; the count only updates on reload (ADR 0028 follow-up).
**Fix:** subscribe to an `inbox:{uid}` Realtime topic like the bell (ADR 0027).
Partly mitigated now that DMs ping the bell (P1 #3).

### P2 #6 — Room (team/event/group) messages don't notify — OPEN

The chat-notify fix is DM-only; room messages still ping nobody. Enumerating
room recipients means fanning out across source-membership tables and must
respect the participant `muted_at` flag + a per-recipient throttle. **Fix:**
extend [notify-chat.ts](../../apps/web/src/lib/notify-chat.ts) with a room
branch (in_app default; push opt-in), mute-aware.

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
