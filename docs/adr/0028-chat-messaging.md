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
helpers, broadcast trigger, RPCs — no app code consuming it). This bundle is
**Phase 1: the team-room MVP** — infrastructure adapters, the composition-root
`getChatHandlers()`, server actions, and the `TeamChatPanel` client island on
`/teams/[id]`. **Phase 3** wires DMs (`getOrCreateDm` already exists). **Phase 4**
is the image fast-follow: it drops the single `messages_text_only` CHECK to
enable the reserved `attachments jsonb` column — no table migration needed.

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

- **Phase 2 — unread state:** an inbox / unread badge driven by
  `conversation_participants.last_read_at` vs. `conversations.last_message_at`.
- **Phase 3 — DMs:** wire `getOrCreateDm`, a DM list, and the block UI.
- **Phase 4 — attachments:** drop `messages_text_only`, add image upload.
- **Sender card in the broadcast payload** so live rows don't depend on a
  client-side roster lookup.
- **e2e:** member sends → second member receives live; non-member is denied;
  report auto-hides at threshold.
- **Tab-visibility gating** for the subscription (shed idle connections), same
  follow-up noted in ADR 0027.
