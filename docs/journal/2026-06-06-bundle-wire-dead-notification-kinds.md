# Wire two of the three dead notification kinds (2026-06-06)

## Context

First quick-win bundle of the "wrap up outstanding items" plan
([temporal-prancing-marshmallow plan]; backlog in
[docs/audits/notifications-messaging.md](../audits/notifications-messaging.md)
P2 #2). Three notification kinds had a category, channel map, and email/sms/
in_app templates but **no `notify()` call site** — dead config that lint and
typecheck can't catch. This bundle lights up the two that aren't blocked on an
unbuilt feature.

## Decisions

- **`social.follow.new` fires from `addFriend`, not the group-follow action.**
  The payload is `{ followerId, followerName }` — a user-follows-user event.
  In this codebase "following a player" is the directed `friendships` edge
  (ADR 0020 §5) written by `addFriend`, so that's the source. Group follow is a
  separate concept (`group_activity` category) and stays silent.
- **Both fire on the followed user's bell only (in_app).** Matches the kind's
  channel map. No email — a new follower isn't email-worthy.
- **Coalesce in_app, because in_app carries no idempotency key.** `dispatch`
  only stamps the idempotency key on outbox channels (email/sms/push); the
  in_app insert has none. So a naive wire would duplicate the bell on every
  resend. Both new helpers therefore mirror `notify-chat.ts`: skip when an
  unread ping for the same target already waits. For follows the dedup key is
  the `/players/<followerId>` href; the edge upsert is idempotent
  (`ignoreDuplicates`), so a follow/unfollow/re-follow churn would otherwise
  re-ping.
- **`host.stripe.action_required` dedups two ways.** Stripe re-sends
  `account.updated` on every change. Email/push get an idempotency key keyed on
  a **requirement signature** (`disabled_reason | sorted(past_due+currently_due)`)
  so one mail goes out per distinct outstanding-requirement set; in_app
  coalesces on the unread bell so the host sees one "fix Stripe" bell at a time.
  Chose the unread-bell coalesce over comparing prior mirror state (the
  first-transition approach the file already defers for analytics) — simpler and
  good enough for a best-effort nudge.
- **`event.waitlist.promoted` left dead — on purpose.** There's no waitlist
  feature to fire it. It's wired in Phase 3a when the promote handler lands.
- **Fan out via `after()`** from `addFriend` so the notify never adds latency to
  the follow (same pattern as `sendChatMessage`). The webhook calls its helper
  inline (it's already a background context).

## Changes

- `apps/web/src/lib/notify-follow.ts` (new) — `notifyNewFollower`, best-effort
  on the admin client, reads the follower name from `profiles_public` (#13),
  coalesces on the unread-bell href.
- `apps/web/src/app/friends/actions.ts` — `addFriend` fires `notifyNewFollower`
  via `after()`.
- `apps/web/src/lib/webhooks/connect.ts` — `maybeNotifyStripeActionRequired`
  (new export) called at the end of `handleAccountUpdated`.
- Tests: `notify-follow.test.ts` (4), `webhooks/connect.test.ts` (5) — mock the
  admin client + `notify` at the module boundary; pin the self-follow guard,
  coalesce skip, name fallback, signature key, and message selection.
- `docs/audits/notifications-messaging.md` — P2 #2 marked ◑ mostly resolved.

## Patterns observed

- **in_app has no idempotency; only the outbox channels do.** Any new `notify()`
  trigger that can fire repeatedly for the same logical event needs its own
  in_app coalesce (an unread-row lookup), _plus_ an idempotency key for the
  outbox channels. This is now the third site to do it (chat, follow, stripe).
  Worth keeping in mind for the room-message pings (2b) and waitlist (3a).

## Follow-ups

- **`event.waitlist.promoted`** — wire from the promote handler in Phase 3a
  ([notifications-messaging.md](../audits/notifications-messaging.md) P2 #2).
- **First-transition tightening** for the Stripe nudge (compare prior mirror
  state) stays deferred — the unread-bell coalesce covers the spam case.
