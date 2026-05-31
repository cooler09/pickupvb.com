# Chat messaging — Phase 2: unread + inbox (2026-05-31)

## Context

Phase 1 (same day) shipped the team-room MVP. Phase 2, per
[ADR 0028](../adr/0028-chat-messaging.md), is the **unread / inbox** surface
driven by `conversation_participants.last_read_at` vs.
`conversations.last_message_at`. The user picked the scope: a `/messages` inbox
page **plus** a server-rendered unread badge on the site header (live badge
deferred).

## Decisions

- **`SECURITY INVOKER` read RPCs, not `DEFINER`.** `get_inbox(int)` and
  `count_unread_conversations()` need no privilege escalation — RLS on
  `conversations` already filters a SELECT to the caller's accessible rooms (the
  `conversations_select` policy is `can_access_conversation`). So they ride RLS
  as the caller; a non-member just gets fewer rows. This is the opposite choice
  from the Phase-1 `get_or_create_*` RPCs, which are DEFINER precisely because
  they must authorize-then-insert past RLS. Chose RPCs over hand-built PostgREST
  queries because resolving per-`kind` titles / previews / slugs + the unread
  predicate is far cleaner in one SQL statement than N adapter round-trips.
- **"Unread by me" excludes my own messages.** `is_unread` = a non-deleted
  message from someone _else_ newer than my `last_read_at`. Without the
  `sender_id <> auth.uid()` clause, every thread I posted in would show unread
  until I re-opened it (sending bumps `last_message_at` past my cursor).
- **New read port `ConversationQueries`, separate from `MessageQueries`.** The
  latter is thread-scoped (`listMessages`); the inbox is conversation-scoped.
  Both are viewer-implicit (no `viewerId` arg) — the user-scoped client + RLS is
  the scope, same posture as `listMessages`.
- **Badge is server-rendered, not live.** Folded the count into the header's
  existing `Promise.all` batch (it already reads the bell + team-invite counts).
  Live updates are a logged follow-up — the same staged path the bell took before
  ADR 0027, and not worth a per-page multi-topic subscription yet.
- **Inbox links to the context page, not a standalone thread view.** Phase-1 chat
  lives on `/teams/[id]`, and opening it marks read — so the inbox row links
  there. `inboxHref` resolves team/group by slug, event by id, and returns `null`
  for `dm` (no destination until Phase 3).

## Changes

- `supabase/migrations/20260825000000_chat_inbox_rpcs.sql` — new; the two
  `SECURITY INVOKER` read RPCs. Applied locally; types regenerated.
- `packages/domain/src/messaging/message-queries.ts` — `InboxItem` read model +
  `ConversationQueries` port.
- `packages/application/src/queries/message-queries.handler.ts` — `ListInboxHandler`
  - `CountUnreadConversationsHandler` (zero-arg, viewer-implicit).
- `packages/infrastructure/src/supabase-messaging-repository.ts` —
  `SupabaseConversationQueries` adapter.
- `apps/web/src/lib/handlers.ts` — `getChatHandlers()` now also returns
  `listInbox` + `countUnreadConversations`.
- `apps/web/src/app/messages/page.tsx` — new inbox page.
- `apps/web/src/components/messages-nav-link.tsx` — new; header link + badge,
  styled to match the bell.
- `apps/web/src/components/site-header.tsx` — reads the unread count in the
  server batch and mounts the link in the desktop + mobile clusters.

## Patterns observed

- **The DEFINER-vs-INVOKER call is per-operation, set by whether the op writes
  past RLS.** Phase 1's creation RPCs authorize a membership the caller can't see
  and then insert → DEFINER. Phase 2's reads only ever want what the caller can
  already see → INVOKER + plain RLS. Reaching for DEFINER on the reads would have
  meant re-implementing `can_access_conversation` as an explicit per-row gate for
  no benefit.
- **Server-component timestamps trip the purity rule if they read `Date.now()`.**
  The inbox renders an absolute date from each row's own `lastMessageAt` (pure,
  ISO-derived) rather than a relative "2h ago" — relative time needs `now`, which
  the React Compiler purity rule flags in a render body (AGENTS.md "Patterns" #4).
  Live local times stay client-side in `TeamChatPanel`.

## Follow-ups

(Tracked in [ADR 0028](../adr/0028-chat-messaging.md) follow-ups.)

- **Live unread badge** — subscribe to a per-user `inbox:{uid}` topic instead of
  reading the count once per page.
- **Mark-read after send** in `TeamChatPanel` so a just-posted thread isn't
  briefly unread in the inbox.
- **Phase 3 (DMs)** gives `dm` inbox rows a destination; **Phase 4** adds
  attachments.
- **e2e** for the inbox (unread shows → clears after open) alongside the Phase-1
  live-path checks.
