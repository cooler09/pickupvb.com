# Live header Messages unread badge (2026-06-06)

## Context

First high-value bundle of the "wrap up outstanding items" plan (Phase 2a),
closing notifications-messaging audit P2 #5. The header Messages badge was
server-rendered from `count_unread_conversations` and only updated on a full
navigation; the bell already went live (ADR 0027) but the Messages badge didn't.

## Decisions

- **Reuse the bell's `notifications:<userId>` Broadcast topic — don't add an
  `inbox:{uid}` topic.** The DM ping (`chat.message.received`) already flows over
  that topic, so the badge can increment on it with zero new DB/Realtime infra.
  An `inbox` topic would need a new trigger + RLS policy for no extra signal
  today.
- **Extract a ref-counted shared subscriber** rather than open a second channel.
  The RLS topic is fixed at `notifications:<userId>`, so a second component
  joining the _same_ private topic on the same socket is rejected. The single
  channel now lives in `subscribe-notifications.ts`, ref-counted, fanning each
  row out to all listeners (the bell + the badge); last listener out tears it
  down. The bell's behaviour is unchanged — its bespoke channel effect became a
  one-line `subscribeToNotifications(...)` call with the same setState callback.
- **setState in the subscription callback, not a `useSyncExternalStore`
  snapshot.** The plan floated `useSyncExternalStore`, but the consumers need
  _different_ reactions to the same row (the bell prepends the row + bumps; the
  badge bumps only on `chat.message.received`), and a callback-driven setState is
  the sanctioned external-store escape (AGENTS.md pattern #5 — not the flagged
  mount-time write). A scalar snapshot would lose the row payload the bell needs.
- **Accept an approximate live count between navigations.** The DM ping is
  coalesced (one per conversation per unread window), so each increment ≈ a
  newly-active conversation; the exact `count_unread_conversations` re-syncs on
  the next navigation (including landing on `/messages`, which marks read). A
  perfectly-reconciled live count (decrement on read, dedup per conversation)
  would need a dedicated inbox projection — deferred as over-engineering for a
  header nudge.

## Changes

- `apps/web/src/lib/subscribe-notifications.ts` (new) — ref-counted shared
  subscriber + the `NotificationRow` type (moved from the bell).
- `apps/web/src/components/notification-bell.tsx` — consumes the shared
  subscriber; dropped its own channel plumbing (behaviour identical).
- `apps/web/src/components/messages-nav-link.tsx` — now `'use client'`, takes
  `userId` + `initialUnread`, increments on `chat.message.received`.
- `apps/web/src/components/site-header.tsx` — passes `userId` to both badge
  call sites (desktop + mobile).
- `docs/audits/notifications-messaging.md` — P2 #5 resolved.

## Patterns observed

- **One private Realtime topic, many consumers → one ref-counted channel.** A
  fixed-name private topic (RLS-matched, no random suffix) can't be joined twice
  on one socket. When a second component needs the same stream, extract a
  ref-counted module singleton rather than opening a parallel channel. Candidate
  pattern for AGENTS.md if a third consumer appears.

## Follow-ups

- **Verify Realtime delivery on a deployed preview** (two sessions) — the
  channel join + broadcast path can't be exercised in the local quad, same
  deploy-gating as the rest of the chat/notifications Realtime work.
- **Rooms** join the live badge automatically once room pings (P2 #6 / Phase 2b)
  start enqueuing `chat.message.received`.
