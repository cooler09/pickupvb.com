# Room-message push pings (2026-06-06)

## Context

Phase 2b of the "wrap up outstanding items" plan, closing notifications-messaging
audit P2 #6. Chat DMs pinged their recipient (Bundle 101 / P1 #3) but room
(team/event/group) messages pinged nobody — the gap the audit deferred because
room recipients aren't a single table read.

## Decisions

- **Resolve room recipients via a SECURITY DEFINER RPC, not TS.** Room membership
  is _derived_ from the source tables (team_members + captain / event host +
  co-hosts + division-joined attendees / group_members), not materialized in
  `conversation_participants` (20260824000000). Replicating that 4-source logic
  in the app layer would duplicate `can_access_conversation` and drift from it.
  `list_room_recipients` mirrors that proven gate's branches exactly, inverted
  from "is caller a member" to "list members", and excludes the sender + muted
  members in SQL. Service-role-only grant (it would otherwise leak a roster).
- **Uniform `/messages/<id>` deep-link for all kinds.** The inbox links rooms to
  their context page (`/teams/<slug>` …), which would need slug resolution and a
  per-kind coalesce key. But `/messages/[id]` renders every conversation kind, so
  the ping deep-links there — uniform href ⇒ uniform coalesce key, no slug
  lookups.
- **Batch the coalesce into one query.** The DM path checked the unread-ping
  window per recipient (fine for 1). A room could have dozens, so the check is
  now a single `.in('user_id', recipientIds)` lookup → a skip-set; a busy room
  costs one query, not N. Applied to DMs too (a 1-element `.in`).
- **Push stays opt-in.** Channels follow the kind's existing map
  (`chat.message.received` = push + in_app); `channelAllowedByPrefs` already
  makes push opt-in (P1 #2), so a room can't force-push a whole roster.
- **Mute is respected in the RPC, not the app.** `conversation_participants` is
  the mute store even though membership is derived; a member with no row simply
  isn't muted.

## Changes

- `supabase/migrations/20260916000000_list_room_recipients.sql` (new RPC).
- `packages/supabase/src/database.types.ts` — hand-edited to add the function
  signature ahead of the real schema (regenerate on next `gen:types`).
- `apps/web/src/lib/notify-chat.ts` — dropped the DM-only early return; branch on
  kind (DM = participant query, room = RPC); batched coalesce; shared notify loop.
- `apps/web/src/lib/notify-chat.test.ts` — DM tests retained; +3 room tests
  (fan-out, per-recipient coalesce, empty room) with a mocked `rpc`.
- `docs/audits/notifications-messaging.md` — P2 #6 resolved.

## Patterns observed

- **Derived membership → invert the access helper into a list, don't re-derive.**
  When a feature needs "who are the members" and an access gate already answers
  "is X a member", a set-returning SECURITY DEFINER sibling keeps them from
  drifting. Reuses pitfall #8's "admin/definer is correct for session-less
  fan-out" framing.

## Follow-ups

- **Deploy-gated:** the RPC SQL + hand-edited types can't run in the local quad
  (no Docker); `gen:types` reconciles the types and the fan-out is verifiable
  only against a deployed DB. Run a room message → roster-ping check post-deploy.
- **Large-room cost:** the notify loop is sequential N `notify()` calls in
  `after()`. Fine for typical rosters (<30); if a room ever grows large, batch
  the prefs load + outbox insert. Noted, not built.
