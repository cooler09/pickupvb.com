# Chat messaging — Phase 3: direct messages + blocks (2026-05-31)

## Context

Phases 1–2 (same day) shipped the team-room MVP and the inbox/unread surface.
Phase 3, per [ADR 0028](../adr/0028-chat-messaging.md), is **1:1 direct
messages + the block UI**. The data layer was already complete from Phase 0 —
`get_or_create_dm`, `user_blocks`, `is_blocked_pair`, and the DM branches of the
access helper / RLS policies all landed in the first migration — so this bundle
is **pure app + web wiring, no migration**.

## Decisions

- **Extracted a shared `ConversationView` instead of a second chat UI.** The DM
  thread and the team room need the identical live surface (message list,
  composer, edit/delete/report, load-earlier, `chat:{id}` subscription). Rather
  than duplicate ~250 lines, I pulled that surface into
  `components/conversation-view.tsx` and made `TeamChatPanel` a thin
  bootstrap-and-gate wrapper around it. The DM page bootstraps server-side and
  mounts the same view. This is the DRY-correct split and matches the repo's
  architecture-initiative direction; the panel kept its exact Phase-1 behavior
  (renders nothing for anon/non-members).
- **Generic chat actions moved to `app/_actions/chat-actions.ts`.** They were in
  `teams/[id]/chat-actions.ts` but are conversation-scoped, not team-scoped (they
  take `conversationId`/`messageId`). Co-locating a shared component with a
  route-specific action file is a smell, so they moved to the shared `_actions/`
  home (alongside `hide-broadcast.ts`). Only `TeamChatPanel` imported the old
  path.
- **Block/unblock drives the port directly — no command handler.** A block is a
  no-invariant self-edge (the only rule is the DB not-self CHECK), so per
  AGENTS.md pattern #10 the server action constructs `SupabaseUserBlockRepository`
  and calls it, the same shape as `broadcast-actions.ts`. A command handler would
  be pure ceremony. The _port_ still lives in the domain (`UserBlockRepository`)
  so the dependency direction holds.
- **`OpenDmHandler` is symmetric with `OpenConversationHandler`.** DM open _does_
  go through a handler (unlike block) because it mirrors the existing room-open
  handler and rides the same `ConversationRepository.getOrCreateDm` port that was
  defined in Phase 0 — keeping the two "open a conversation" paths parallel.
- **DM entry point is the player profile "Message" button.** Natural launch
  point; the `other` state of `PlayerViewerActions` already had a CTA row. It
  calls `startDmWithUser` → navigates to `/messages/{id}`. A from-the-inbox
  recipient picker is a logged follow-up.

## Changes

- `packages/application/src/messages.ts` + `commands/message.handler.ts` —
  `OpenDmCommand` + `OpenDmHandler`.
- `packages/domain/src/messaging/user-block.ts` — `UserBlockRepository` port.
- `packages/infrastructure/src/supabase-messaging-repository.ts` —
  `SupabaseUserBlockRepository` (block / unblock / hasBlocked).
- `apps/web/src/lib/handlers.ts` — `getChatHandlers().openDm`.
- `apps/web/src/app/_actions/chat-actions.ts` — **new home** for the shared chat
  actions (moved from `teams/[id]/`), plus `startDmWithUser` / `blockUser` /
  `unblockUser`.
- `apps/web/src/components/conversation-view.tsx` — **new**; the shared live
  surface extracted from `TeamChatPanel`.
- `apps/web/src/app/teams/[id]/_components/team-chat-panel.tsx` — slimmed to a
  bootstrap wrapper over `ConversationView`.
- `apps/web/src/app/messages/[id]/page.tsx` + `_components/block-control.tsx` —
  **new**; the DM thread page + block toggle.
- `apps/web/src/app/players/[id]/_components/player-viewer-actions.tsx` —
  "Message" button.
- `apps/web/src/app/messages/page.tsx` — `inboxHref` now routes `dm` rows to
  `/messages/{id}`.

## Patterns observed

- **An extraction is the cheapest way to add the second surface.** The moment a
  feature needs the same interactive widget in a new place, lifting it to
  `components/` (props in, no embedded access logic) is less code than a parallel
  implementation and removes the drift risk. `ConversationView` takes an already-
  opened `conversationId` + initial page; each caller owns its own bootstrap
  (client-side gate for the team island, server-side load for the DM page).
- **DEFINER vs INVOKER vs direct-port, continued.** Phase 1 creation = DEFINER
  RPC (writes past RLS); Phase 2 reads = INVOKER RPC (ride RLS); Phase 3 block =
  direct port from the action (no invariant, RLS-gated self-edge). Three points
  on the same spectrum — the gate is always "does this need to do something the
  caller's own RLS context can't?"

## Follow-ups

(Tracked in [ADR 0028](../adr/0028-chat-messaging.md).)

- **Phase 4 — attachments.**
- **Start-a-DM from the inbox** (recipient picker); today only the profile button
  starts one.
- **Blocked-state banner** on the DM thread (currently the next send just fails
  with the generic message).
- **Live unread badge** + **mark-read-after-send** (carried from Phase 2).
- **e2e** for the DM round-trip + block (sender→recipient live; blocked pair
  cannot send) alongside the Phase-1/2 checks.
