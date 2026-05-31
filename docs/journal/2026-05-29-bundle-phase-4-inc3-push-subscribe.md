# 2026-05-29 — Bundle: Phase 4 (increment 3) — push subscribe

Continues the notification subdomain. inc. 2 put the worker's `push_subscriptions`
read/prune behind `PushSubscriptionPort`; this adds the **write** side (the
browser subscribe/unsubscribe route).

## What changed

- **Domain** (`notifications/push-subscription-port.ts`): `PushSubscriptionPort`
  gained `upsert(userId, sub)` + `removeForUser(userId, endpoint)`, plus a
  `PushSubscriptionUpsert` DTO (`endpoint` / `p256dh` / `auth` / `userAgent`).
- **Infra** (`supabase-push-subscription-repository.ts`): `upsert` (on-conflict
  `endpoint`; the adapter sets `last_used_at` / `failure_count`) +
  `removeForUser` (delete by user + endpoint). The constructor field is renamed
  `admin` → `client` since it's no longer admin-only.
- **Web** (`api/notifications/subscribe/route.ts`): POST → `upsert`, DELETE →
  `removeForUser`, off raw `supabase.from('push_subscriptions')`.

## Decisions

- **Client-injected, used both ways.** The subscribe route is **user-scoped**
  (the viewer manages their own subscription, RLS enforces `user_id = auth.uid()`),
  so it constructs the adapter with `getServerSupabase()`. The worker (inc. 2)
  constructs the same adapter with the admin client (session-less read/prune).
  One adapter, two clients — the constructor is now generically `client`, not
  `admin`.
- **DTO carries only browser-supplied fields.** `last_used_at` / `failure_count`
  are persistence bookkeeping the adapter sets, not part of the port DTO.
- **DELETE stays best-effort.** The old route ignored the delete error and
  returned `ok`; unsubscribe failure doesn't matter to the client (the worker
  prunes dead endpoints anyway), so the route swallows + returns `ok`. POST
  surfaces a 500 with the message on failure (matching the prior behavior).
- **No new tests.** Thin persistence ops, no domain rule.

## Changes

- Domain: `notifications/push-subscription-port.ts` (`upsert` / `removeForUser`
  - `PushSubscriptionUpsert`).
- Infra: `supabase-push-subscription-repository.ts` (both methods; `admin` →
  `client`).
- Web: `api/notifications/subscribe/route.ts`.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 267, application 42, web 55, infra 7; lint 0 errors). No DB change.

## Follow-ups (rest of the notification subdomain, P2-1 Fix #3)

- **Broadcasts** (event/team `broadcast-actions.ts`, `_actions/hide-broadcast.ts`)
  — a `BroadcastPort`.
- **Preferences** (`profile/notifications` page + actions) —
  `notification_preferences` read/write (the prefs page).
