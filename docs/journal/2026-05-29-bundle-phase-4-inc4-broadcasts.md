# 2026-05-29 — Bundle: Phase 4 (increment 4) — broadcasts

Continues the notification subdomain (ADR 0022). Moves the `broadcasts` table
behind a `BroadcastPort`.

## What changed

- **Domain** (`notifications/broadcast-port.ts`, new): `BroadcastPort`
  (`create` / `markSent` / `findSender` / `softDelete`) + `BroadcastInput` +
  `BroadcastAudienceType`.
- **Infra** (`supabase-broadcast-repository.ts`, new): client-injected
  `SupabaseBroadcastRepository`.
- **Web**:
  - [events/[id]/broadcast-actions.ts](../../apps/web/src/app/events/%5Bid%5D/broadcast-actions.ts)
    - [teams/[id]/broadcast-actions.ts](../../apps/web/src/app/teams/%5Bid%5D/broadcast-actions.ts)
      — `create` (user client) → fan-out → `markSent` (admin).
  - [\_actions/hide-broadcast.ts](../../apps/web/src/app/_actions/hide-broadcast.ts)
    — `findSender` (user client, sender authz) → `softDelete` (admin).
  - Both send actions' sender-name `profiles` reads → `ProfileQueries.findCardById`.

## Decisions

- **Client-per-operation, picked at the call site.** The `broadcasts` RLS shape
  is split: insert is host/captain-only and the sender can read their own row
  (user client enforces both), while fan-out completion (`markSent`) and the
  soft-delete must bypass RLS (admin — the fan-out reaches everyone, and the
  soft-delete trips the same `select`-as-`WITH CHECK` quirk as group delete,
  with sender authz enforced in the action first). So the adapter is
  client-injected and each action constructs it with the right-privileged client
  per op (`new SupabaseBroadcastRepository(supabase)` for create/findSender,
  `new SupabaseBroadcastRepository(getAdminSupabase())` for markSent/softDelete).
  Documented on the port so the split isn't mistaken for an oversight.
- **Sender-name reads drained too.** Both send actions read `profiles` for the
  sender's display name — moved to `ProfileQueries.findCardById` so the profiles
  surface stays fully behind its port. (`findCardById` reads `profiles_public`;
  the display name is there.)
- **Recipient/team reads stay raw.** `event_participants` (attendees),
  `team_members` (active), and `teams` (slug/name) are events/teams-subdomain
  reads, not broadcast concerns — left raw with a comment. Migrating them belongs
  to event/team read ports (not built).
- **No new tests.** Thin persistence ops + provider-bound fan-out; no domain rule.

## Changes

- Domain: `notifications/broadcast-port.ts` (new) + barrel.
- Infra: `supabase-broadcast-repository.ts` (new) + barrel.
- Web: `events/[id]/broadcast-actions.ts`, `teams/[id]/broadcast-actions.ts`,
  `_actions/hide-broadcast.ts`.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 267, application 42, web 55, infra 7; lint 0 errors). No DB change.

## Follow-ups

- **Preferences** (`profile/notifications` page + actions) — `notification_preferences`
  read/write. The **last** P2-1 surface; after it, the notification subdomain
  (and P2-1's web-layer drain) is effectively complete.
