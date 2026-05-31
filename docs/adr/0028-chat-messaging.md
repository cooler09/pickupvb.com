# 0028. Chat / messaging — a unified conversation engine

- **Status:** Accepted
- **Date:** 2026-05-31
- **Relates to:** [ADR 0024 — Event & profile media](0024-event-and-profile-media.md)
  (the UGC moderation template), [ADR 0027 — Realtime Broadcast for
  notifications](0027-realtime-broadcast-notifications.md) (the private-topic
  Broadcast pattern), [ADR 0021 — Group aggregate & repository](0021-group-aggregate-and-repository.md)
  (the RPC-backed edge-operation repo shape).

## Context

PickupVB had no messaging concept. The product needs both **context rooms** —
a chat scoped to a team, an event, or a group — and eventually **1:1 direct
messages**. We want one engine, not three, and we want live delivery without
standing up new infrastructure.

Three things are already in the tree that this should reuse rather than reinvent:

1. **UGC moderation** (`media_posts`, ADR 0024): a report table, an
   after-report auto-hide trigger, an anonymous-auth INSERT guard, and a
   soft-delete lifecycle.
2. **Realtime Broadcast from the database** (ADR 0027): a `SECURITY DEFINER`
   AFTER-write trigger calling `realtime.broadcast_changes` to a private
   per-entity topic, authorized by a SELECT policy on `realtime.messages`.
3. **RLS membership helpers** (`is_event_host`, `is_platform_admin`): SECURITY
   DEFINER so access checks don't recurse through the policies that call them.

The open question was where the room **participant set** lives. Materializing a
participant row per member per room duplicates the source-of-truth membership
tables (`team_members` / `event_participants` / `group_members`) and creates a
backfill/whenever-membership-changes sync problem.

## Decision

A single `conversations` engine spanning four `kind`s — `team` / `event` /
`group` / `dm` — with **derived** room membership and live delivery over
Broadcast.

- **Room access is derived, not materialized.** A `team`/`event`/`group`
  conversation has no participant rows; `can_access_conversation(id)` (SECURITY
  DEFINER) resolves access by subquerying the matching source-membership table.
  Membership changes are reflected instantly with zero sync. **DMs are the
  exception:** their two `conversation_participants` rows _are_ the access grant.
- **`Message` is the one write aggregate.** It carries the invariants worth
  centralizing — the non-anonymous send guard, body validation, and the
  sender-vs-moderator rule on the `deleted_at` state machine — so they live in
  one unit-tested place instead of scattered across actions and SQL.
- **Conversations are RPC-backed edge operations, not an aggregate.** A
  conversation has no app-layer invariant of its own (room membership is the
  source tables' concern; the read cursor is self-scoped state), so
  `ConversationRepository` is the focused get-or-create / mark-read shape of
  `GroupRepository.addFollowEdge` — not a load/save aggregate. Creation runs
  through the `get_or_create_conversation` / `get_or_create_dm` SECURITY DEFINER
  RPCs, which authorize against the source membership and resolve the
  open-simultaneously race against partial unique indexes.
- **Reads are a CQRS read port** (`MessageQueries.listMessages`) returning plain
  camelCase `MessageView`s. Per-viewer and live — **never cached** (caching would
  fight Realtime delivery). Deleted messages return as tombstones (`isDeleted`,
  empty `body`) so the sender/moderator never see a removed body.
- **Live delivery mirrors ADR 0027** on a per-conversation topic
  `chat:{conversation_id}`: a `broadcast_message()` trigger emits INSERTs (new
  messages) and UPDATEs (edits / soft-delete tombstones); a `realtime.messages`
  SELECT policy authorizes a subscriber via `can_access_conversation`.
- **Moderation reuses the media template:** `message_reports` (unique per
  reporter) + an after-report trigger that counts and auto-hides at a threshold.
  `user_blocks` gate DM creation and DM sends in both directions.
- **RLS is the authorization gate** (AGENTS.md pitfall #8). Every write runs on
  the caller's user-scoped client; the adapters map a Postgres `42501` to a typed
  `UnauthorizedError`. No write delegates authorization to the admin client.

### Phased rollout

The migration `20260824000000_chat_messaging.sql` is **Phase 0** (schema, RLS,
helpers, broadcast trigger, RPCs — no app code consuming it).

**Phase 1 (shipped): the team-room MVP** — infrastructure adapters, the
composition-root `getChatHandlers()`, server actions, and the `TeamChatPanel`
client island on `/teams/[id]`.

**Phase 2 (shipped): unread + inbox.** A second migration
(`20260825000000_chat_inbox_rpcs.sql`) adds two `SECURITY INVOKER` read RPCs —
`get_inbox(int)` and `count_unread_conversations()` — that ride RLS as the
caller (no privilege escalation; a non-member just gets fewer rows) and resolve
titles / previews / slugs per `kind` in SQL. They back a `ConversationQueries`
read port → `SupabaseConversationQueries` adapter, surfaced as a `/messages`
inbox page and a server-rendered unread badge on the site-header "Messages"
link. "Unread by me" = a non-deleted message from someone else newer than my
`last_read_at` (a thread I only posted in is not unread). The badge reflects the
last page load; live updates are deferred (see follow-ups).

**Phase 3 (shipped): DMs + blocks.** No migration needed — `get_or_create_dm`,
`user_blocks`, `is_blocked_pair`, and the DM RLS branches all landed in Phase 0.
This bundle wires the UI: an `OpenDmHandler` (+ `getChatHandlers().openDm`), a
`UserBlockRepository` port + `SupabaseUserBlockRepository` adapter, the shared
`ConversationView` (extracted from `TeamChatPanel` so the team room and the DM
thread render the identical live surface), a `/messages/[id]` thread page (DM
header links to the counterpart's profile + a block/unblock toggle), a "Message"
button on `/players/[id]`, and DM routing from the inbox. The generic chat
server actions moved to `apps/web/src/app/_actions/chat-actions.ts` so both
surfaces share them. Block/unblock is a no-invariant self-edge, so the action
drives the port directly (no command handler — AGENTS.md pattern #10).

**Phase 4** is the image fast-follow: it drops the single `messages_text_only`
CHECK to enable the reserved `attachments jsonb` column — no table migration
needed.

## Consequences

- **Positive:** one engine for all room kinds + DMs; membership is never
  duplicated or out of sync for rooms; the only aggregate is the one place with
  real invariants; live delivery reuses the proven private-Broadcast path with no
  new infrastructure.
- **Graceful degradation:** if private-channel auth is misconfigured, the room
  stops receiving _live_ updates — messages still persist and render on the next
  open. No data loss, no user-facing error.
- **Live broadcast rows carry only `sender_id`.** `broadcast_changes` emits the
  raw `messages` row, not a joined sender card, so the client resolves the
  author's name from the roster it already has (the `TeamChatPanel`
  `participants` prop) and falls back to "Member". Embedding a sender card in the
  payload is a follow-up.
- **Not exercised by the build/typecheck/test quad** (Realtime + RLS + triggers).
  The domain/application layers are unit-tested; the live path must be **verified
  on dev**. An e2e is a follow-up, not part of the landing PR.
- **Reversible:** drop the triggers, policies, RPCs, and tables in a follow-up
  migration; remove the panel + adapters. Nothing else depends on it yet.

## Follow-ups

- **Phase 4 — attachments:** drop `messages_text_only`, add image upload.
- **Start-a-DM from the inbox** (a recipient picker) — today a DM is only
  startable from a player profile's "Message" button.
- **Blocked-state banner on the DM thread** — blocking currently just makes the
  next send fail with the generic "can no longer post" message; a dedicated
  banner would read better.
- **Live unread badge:** the header `count_unread_conversations` is read once per
  page load. Make it live by subscribing to the viewer's conversation topics (or
  a per-user `inbox:{uid}` topic), the same upgrade the bell took in ADR 0027.
- **Sender card in the broadcast payload** so live rows don't depend on a
  client-side roster lookup.
- **Mark-read after send** in `TeamChatPanel` so a thread you just posted in
  doesn't briefly count as unread in the inbox on the next visit.
- **e2e:** member sends → second member receives live; non-member is denied;
  report auto-hides at threshold; inbox shows unread → clears after open.
- **Tab-visibility gating** for the subscription (shed idle connections), same
  follow-up noted in ADR 0027.
