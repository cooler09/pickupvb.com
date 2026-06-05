# Notifications & messaging audit + push/chat P1 bundle (2026-06-04)

## Context

User report: "some features don't seem to be working, like push notifications —
do a full audit of the messaging system (push, email, in-app)." Three-channel
exploration found the architecture sound (outbox + cron worker, Realtime bell,
Resend, web-push) but with a config/coverage failure that fully explains the
push symptom, plus a genuine functional gap (chat). New audit:
[docs/audits/notifications-messaging.md](../audits/notifications-messaging.md).

The user was testing on **Android Chrome + Desktop** (not iOS), which reframed
the diagnosis away from "iOS PWA missing" toward env/cron/coverage.

## Decisions

- **Root cause is config, not code.** The whole pipeline is wired correctly.
  The decisive finding: **Vercel Cron jobs run only on _production_
  deployments**, so on `dev.pickupvb.com` (a Preview) the every-5-min outbox
  worker never fires — preview delivery hangs entirely on the out-of-band
  `pg_net` kick (ADR 0026). Combined with VAPID env vars not being set per
  Preview env, push on dev is dead end-to-end. Documented as ops P1s rather
  than "fixed in code" because the fix is Vercel config + secret seeding.
- **Shipped a self-test instead of just docs.** Added
  `POST /api/notifications/test-push` that calls `sendWebPush` **in-request**
  (bypasses outbox + cron + per-kind/preference gating). This is the one tool
  that works on a Preview deploy and instantly tells you which layer fails
  (VAPID config / no subscription / delivery code). Chose this over a
  cron-trigger or a fake outbox row because "push doesn't work" needs a
  one-click isolator, and the in-request path sidesteps the production-only
  cron entirely.
- **Push is always opt-in — even for transactional kinds.** Adding `push` to
  the transactional `event.signup.confirmed` exposed that transactional kinds
  bypass prefs (CAN-SPAM). But push has its own consent model (browser
  permission + device subscription + the "Browser push" toggle), so forcing it
  is wrong. Reworked `channelAllowedByPrefs` so `push` short-circuits on
  `pushEnabled` regardless of category; email/in_app/sms keep the transactional
  bypass. This also fixed the two pre-existing `notify.test.ts` cases my kind
  change broke — the test was the forcing function for the decision.
- **Chat notify is DM-first.** Rooms (team/event/group) defer because
  enumerating recipients means fanning out across source-membership tables and
  needs mute-awareness + a throttle; DMs are the acute case (1:1, no other live
  signal). Chose `after()` (request-scoped, no added latency) over an inline
  `await`, and coalescing via an unread-window check on the existing
  `notifications` feed over a new throttle table.
- **Generated icons in pure Node.** No sharp/imagemagick available, so wrote a
  dependency-free PNG encoder that rasterizes the brand mark (from `icon.svg`)
  at 192/512/180/72 — beats a flat color square, no new dependency.

## Changes

- `packages/notifications/src/kinds.ts` — new `chat.message.received` kind +
  `messages` category + payload; `push` added to `event.signup.confirmed` and
  `event.reminder.24h`.
- `packages/notifications/src/templates.ts` — three renderers for the new kind
  (in-app/push real; email/sms stubs for the exhaustive Record).
- `apps/web/src/lib/notify.ts` — push is always opt-in (transactional bypass no
  longer applies to push).
- `apps/web/src/lib/notify-chat.ts` (new) + `notify-chat.test.ts` — DM ping
  fan-out (recipient resolution, sender exclusion, coalescing, preview).
- `apps/web/src/app/_actions/chat-actions.ts` — `after(notifyChatMessage(...))`
  in `sendChatMessage`.
- `apps/web/src/app/api/notifications/test-push/route.ts` (new) +
  `components/push-test-button.tsx` (new) + the notifications prefs page — push
  self-test.
- PWA: `public/manifest.webmanifest`, `public/icon-192.png`, `icon-512.png`,
  `badge-72.png`, `src/app/apple-icon.png`; `layout.tsx` manifest/appleWebApp/
  themeColor; `push-subscribe-button.tsx` iOS "Add to Home Screen" guidance.
- Env: VAPID keypair generated into local `.env.dev`; `.env.example` notes the
  per-environment Vercel requirement.
- `notify.test.ts` — pins the new kind's channels + the push-opt-in rule.
- Docs: new audit file + README index row.

## Patterns observed

- **Vercel Cron is production-only.** Any worker that depends solely on a
  `vercel.json` cron is dormant on Preview deploys. Either seed the event-driven
  kick per environment or provide an in-request path for dev verification. Worth
  remembering for every future cron-backed feature.
- **Adding a channel to a transactional kind is a consent decision**, not a
  config tweak — push/sms have their own opt-in and must not ride the CAN-SPAM
  bypass that email gets.

## Follow-ups

All tracked in [notifications-messaging.md](../audits/notifications-messaging.md):
P1 #1 (seed preview kick / accept kick-only dev), P1 #2 (set Vercel VAPID),
P2 #2 (wire/remove 3 dead kinds), P2 #3 (Resend bounce webhook), P2 #4
(`List-Unsubscribe`), P2 #5 (live unread badge), P2 #6 (room-message pings),
P3 (quiet hours, SMS, push analytics, mark-read-after-send).
