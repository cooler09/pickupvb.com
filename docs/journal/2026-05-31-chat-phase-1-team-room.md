# Chat messaging — Phase 1 team-room MVP (2026-05-31)

## Context

A chat feature had been started in a session that was lost to a machine restart.
The uncommitted work on disk was **Phase 0 + the inner layers of Phase 1**: the
schema migration (`20260824000000_chat_messaging.sql`), the `messaging` domain
aggregate + ports + tests, and the application command/query handlers + tests.
All of it was internally consistent (typecheck + test green) but **nothing
consumed it** — no infrastructure adapters, no composition-root wiring, no web
layer, and no ADR.

This bundle continues that work: it builds the outstanding Phase-1 layers to a
working **team-room MVP** on `/teams/[id]`, and writes the decision record
([ADR 0028](../adr/0028-chat-messaging.md)) the migration preamble had promised.

## Decisions

- **Continued the saved work rather than resetting.** The recovered code was
  well-architected and the migration preamble encoded the rollout plan, so the
  cheapest correct path was to finish Phase 1, not restart.
- **One adapter file, three adapters** (`supabase-messaging-repository.ts`:
  `SupabaseConversationRepository`, `SupabaseMessageRepository`,
  `SupabaseMessageQueries`) over three files — the row mapping is shared and the
  subdomain is small. Followed the `group` write/read split in spirit but kept it
  in one file.
- **Adapters require a user-scoped client (no admin fallback).** Every chat write
  is RLS-gated, so the constructor takes a required client and a Postgres `42501`
  maps to `UnauthorizedError` — the `live-match-score` template (AGENTS.md pitfall
  #8). Chose this over the optional-client lazy-admin pattern (`media`) because no
  chat path is session-less.
- **Chat is a self-contained client island, not a restructure of
  `TeamViewerChrome`.** `TeamChatPanel` bootstraps its own state after hydration
  (one `openTeamChat` round-trip) and renders nothing for anon/non-members, so the
  ISR-cached `/teams/[id]` page stays cacheable. Matches the existing
  viewer-chrome island shape; avoids forcing the page dynamic.
- **No `revalidatePath` in the chat actions.** Reads are per-viewer and live;
  delivery is the `chat:{id}` Broadcast topic. Documented inline as the deliberate
  exception to AGENTS.md pitfall #1 (same spirit as the Stripe-redirect deferral).
- **Optimistic send + id reconciliation** over pure broadcast-driven append. The
  DB-originated broadcast reaches the sender too, so the panel echoes optimistically
  and reconciles the temp id to the real id to avoid a duplicate on slow delivery.
- **Live rows resolve sender names from the roster.** `broadcast_changes` emits
  the raw `messages` row (no joined profile), so the panel takes a `participants`
  prop and falls back to "Member". Embedding a sender card in the payload is a
  logged follow-up (ADR 0028).

## Changes

- `packages/infrastructure/src/supabase-messaging-repository.ts` — new; the three
  chat adapters. Exported from the infra barrel.
- `apps/web/src/lib/handlers.ts` — new `getChatHandlers()` per-request factory
  (user-scoped client + `can_moderate_conversation` pre-flight for deletes).
- `apps/web/src/app/teams/[id]/chat-actions.ts` — new; typed-`Result` server
  actions (open / send / load-older / edit / delete / report / mark-read).
- `apps/web/src/app/teams/[id]/_components/team-chat-panel.tsx` — new; the live
  chat island (message list, composer, load-older, `chat:{id}` private-Broadcast
  subscription mirroring the notification bell).
- `apps/web/src/app/teams/[id]/page.tsx` — mounts `<TeamChatPanel>` with the
  roster as `participants`.
- `docs/adr/0028-chat-messaging.md` — new decision record.
- `packages/supabase/src/database.types.ts` — regenerated against the applied
  migration (adds the five chat tables + RPCs).

## Patterns observed

- **`ref.current` reads in a render body fail lint, not typecheck.** The panel's
  first cut resolved sender names via a ref-backed map during the message
  `.map(...)`; `react-hooks/refs` ("Cannot access refs during render") only
  surfaced at `pnpm lint`, after a clean typecheck. Fix: every `MessageView`
  already carries `senderName` (resolved at load/broadcast time), so render reads
  the data, never the ref. This is the live counterpart of AGENTS.md "Patterns" #4
  (no impure reads in render) — same rule, ref edition.
- **The DB-originated broadcast is delivered to the sender too.** Unlike a
  client `channel.send()` (gated by the `self` option), a
  `realtime.broadcast_changes` emit from a trigger reaches every subscriber
  including the author — so optimistic UI needs id reconciliation, not a
  self-suppression flag.

## Follow-ups

- **Verify the live path on dev.** The quad doesn't exercise Realtime + RLS +
  triggers; needs a manual two-user check (member receives live; non-member denied;
  report auto-hides) and then an e2e. Logged in ADR 0028.
- **Phase 2 (unread/inbox), Phase 3 (DMs), Phase 4 (attachments)** — all staged in
  the migration and ADR 0028.
- **Sender card in the broadcast payload** so live rows don't depend on a
  client-side roster lookup (ADR 0028).
