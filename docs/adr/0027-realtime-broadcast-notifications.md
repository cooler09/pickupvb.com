# 0027. Realtime Broadcast for in-app notifications (the bell)

- **Status:** Accepted
- **Date:** 2026-05-31
- **Relates to:** [ADR 0022 — `NotificationOutboxPort`](0022-notification-outbox-port.md),
  [ADR 0026 — Event-driven notification delivery](0026-event-driven-notification-delivery.md)
- **Addresses:** Third-party-integrations audit **TPI-7** — the site-header
  notification bell holds a per-tab Realtime connection on the non-scaling
  `postgres_changes` path, on every logged-in page.

## Context

The bell ([notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx))
is mounted in [site-header.tsx](../../apps/web/src/components/site-header.tsx), so
**every logged-in tab** opens a Supabase Realtime channel subscribed to
`postgres_changes` INSERTs on `public.notifications` filtered by `user_id`.

Two problems:

1. **`postgres_changes` is the path Supabase documents as non-scaling.** It
   re-evaluates RLS _per subscriber, per change_ on a single replication stream.
   Concurrent connections track concurrent active tabs; at a few hundred
   simultaneous users this saturates the Realtime connection quota and the
   per-change RLS evaluation becomes the bottleneck. The audit graded this the
   single biggest concurrent-connection + cost lever before launch.

2. **The path is likely inert today.** `postgres_changes` requires the table to
   be a member of the `supabase_realtime` publication. **No migration adds
   `public.notifications` to that publication** (the publication adds are all for
   events / brackets / teams / `match_live_scores` — never `notifications`). So
   in any migration-provisioned database the bell's live updates never fire; the
   bell only reflects the server-rendered snapshot from the last page load.
   (ADR 0026 already _assumes_ the in-app channel is "delivered by Supabase
   Realtime" — this ADR makes that true.)

## Decision

Deliver in-app notifications to the bell via **Realtime Broadcast from the
database** instead of `postgres_changes`.

- A `SECURITY DEFINER` trigger `public.broadcast_notification()` fires `AFTER
INSERT` on `public.notifications` and calls
  `realtime.broadcast_changes('notifications:' || user_id, 'INSERT', …, NEW, OLD)`,
  emitting the new row to a **per-user topic** `notifications:{user_id}`.
- The client subscribes to that topic as a **private** channel
  (`{ config: { private: true } }`) and listens for `broadcast` `INSERT` events,
  reading the new row from `payload.record`.
- **Authorization** is a SELECT policy on `realtime.messages` allowing an
  authenticated user to receive Broadcast messages only where
  `realtime.topic() = 'notifications:' || auth.uid()`. This is the standard
  Realtime Authorization mechanism for private channels.

Why Broadcast over fixing `postgres_changes` (adding the table to the
publication):

- Broadcast needs **no publication** and does **no per-subscriber RLS
  re-evaluation on a replication stream** — authorization is a one-time channel
  check, not a per-change scan. It's the path Supabase recommends for fan-out at
  scale.
- It's strictly less coupling to WAL/replication and lets us scope exactly what
  is emitted (one topic per user) rather than publishing the whole table.

### Scope: the bell only

`match_live_scores` ([live-scores-provider.tsx](../../apps/web/src/app/events/[id]/_components/live-scores-provider.tsx))
**stays on `postgres_changes`** — its
[migration](../../supabase/migrations/20260815000000_match_live_scores.sql#L20-L28)
documents a deliberate choice, and it's event-scoped (only Pro-host event pages,
bounded by per-event viewers). The bracket watchers are likewise event-scoped.
The bell is the every-page driver, so it's migrated first and alone.

## Consequences

- **Positive:** removes the per-tab non-scaling subscription on the hottest
  surface; makes the bell's live updates actually work regardless of publication
  state; isolates each user's stream to their own topic (no shared replication
  fan-out).
- **Graceful degradation:** if the private-channel auth (`realtime.setAuth` →
  `realtime.messages` RLS) is misconfigured, the bell simply stops getting _live_
  updates — notifications still persist (`notifications` table) and render on the
  next page load. No data loss, no user-facing error.
- **Cost:** the client must set the realtime auth token
  (`supabase.realtime.setAuth(session.access_token)`) before subscribing to a
  private channel — one extra `getSession()` on mount.
- **Not exercised by the build/typecheck/test quad** (realtime + RLS + trigger) —
  **verified live on dev** instead (2026-05-31): a notification increments the
  bell badge live, and a _different_ user does not receive it (topic isolation).
  An e2e is a follow-up, not part of the landing PR.
- **Reversible:** drop the trigger + policy in a follow-up migration and revert
  the client effect to `postgres_changes`.

## Follow-ups

- Tab-visibility gating (drop the subscription when `document.hidden`) to shed
  idle connections.
- Migrate event-scoped surfaces only if their concurrency ever warrants it;
  `match_live_scores` stays on `postgres_changes` per its own rationale.
