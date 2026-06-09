# 2026-06-08 — Event + group room chat (ADR 0028 Phase 5)

Closes **M-1** from the 2026-06-08 chat-engine deep-dive
([notifications-messaging.md](../audits/notifications-messaging.md)): event and
group context rooms had a complete backend since Phase 0 (schema, RLS,
`get_or_create_conversation`, `can_access_conversation`, `list_room_recipients`,
inbox title/slug resolution — all branched for `team`/`event`/`group`) but only
the **team** room was ever mounted. So event/group rooms were inert capability:
no creation entry point, never in anyone's inbox, never notifying. Quad-green,
uncommitted, **no new migration**.

## Decision: finish both (not defer)

The deep-dive framed M-1 as finish-vs-defer. Chosen: finish both. The backend was
already paid for; deferring would have meant deleting reachable-by-RPC capability
and the inbox/notify wiring that already references these kinds. Event rooms suit
per-event coordination ("running late", "who's bringing the net"); group rooms
suit persistent communities. Symmetric work once generalized.

## Shape

The team-only surface was two pieces — the `openTeamChat(teamId)` server action
and the `TeamChatPanel` client island. Both were already thin wrappers over
kind-agnostic primitives (`OpenConversationCommand` takes `RoomKind`;
`ConversationView` takes `kind`), so the generalization was mechanical:

- `openTeamChat` → **`openRoomChat(kind: RoomKind, contextId: string)`**
  ([chat-actions.ts](../../apps/web/src/app/_actions/chat-actions.ts)).
- `TeamChatPanel` → a shared **`RoomChatPanel`**
  ([room-chat-panel.tsx](../../apps/web/src/components/room-chat-panel.tsx)) taking
  `kind` / `contextId` / `label` / `participants`. Moved to `components/` since it
  now serves three route trees. The old `_components/team-chat-panel.tsx` was
  deleted.
- Mounted on **`/events/[id]`** (roster = host + co-hosts + attendees, deduped by
  id) and **`/groups/[id]`** (roster = members). The team page was converted to
  the shared panel.

Access is unchanged: the panel self-hides for anon/non-members because
`get_or_create_conversation` rejects them via RLS → `'forbidden'`, exactly as the
team panel always did. So mounting it on the **public** event/group pages is safe
— a non-member sees nothing, and the ISR pages stay cacheable because the island
bootstraps client-side (no `cookies()` at render).

## Inbox routing was already correct

The deep-dive flagged the inbox as mis-routing event/group rows. But
[`inboxHref`](../../apps/web/src/app/messages/page.tsx) already pointed `event` →
`/events/{contextId}` and `group` → `/groups/{contextSlug}` (mirroring `team` →
`/teams/{slug}`). That was a _dead-end_ only because those pages had no chat;
mounting the panels made it correct with **zero routing change**. The
`participants` roster lives where the page already loads it, so the
context-page panel is the roster-aware home; the bell's uniform
`/messages/{id}` deep-link still works (kind-agnostic thread page), with live
author names degrading to "Member" — left to the M-7 broadcast-sender-card fix.

## Follow-ups (still open from the audit)

- **M-3** — Realtime auth token set once, never refreshed (now affects three room
  surfaces, not one). Wire `onAuthStateChange → setAuth`; verify on dev.
- **M-7** — broadcast rows carry only `sender_id`; live authors not in the seeded
  roster show "Member". Now more visible with event rooms (large, churny rosters).
- **M-12** — still no chat e2e; event/group rooms widen the untested surface.
