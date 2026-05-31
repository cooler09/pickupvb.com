# 2026-05-29 — Bundle: Phase 4 (increment 1) — NotificationOutboxPort (notify fan-out)

Opens the last big P2-1 subdomain — the notification outbox (Fix #3). This
migrates the core fan-out (`lib/notify.ts`, the single entry point every trigger
calls) behind a port. Net-new modeling, so it ships with
[ADR 0022](../adr/0022-notification-outbox-port.md).

## What changed

- **Domain** (`notifications/outbox-port.ts`, new): `NotificationOutboxPort` —
  `loadPreferences` / `getUserEmail` / `insertInApp` / `enqueue` — plus the
  camelCase `NotificationPreferences` read model and `OutboxMessage` /
  `InAppNotification` write DTOs. `kind` / `channel` are plain `string`s.
- **Infra** (`supabase-notification-outbox-repository.ts`, new):
  `SupabaseNotificationOutboxRepository` implements the port on the service-role
  client (maps the snake_case prefs row → camelCase; `getUserEmail` wraps
  `admin.auth.admin.getUserById`).
- **Web** (`lib/notify.ts`): `notify()` keeps its signature + best-effort
  `try/catch` + `log.warn`; it constructs the adapter
  (`new SupabaseNotificationOutboxRepository(createSupabaseAdminClient())`) and
  delegates to a new **exported `dispatch(outbox, kind, userId, payload, opts)`**.
  `channelAllowedByPrefs` now reads the camelCase `NotificationPreferences`.
- **Test** (`lib/notify.test.ts`, new): 5 cases drive `dispatch` with a fake
  port — transactional bypass (all prefs off still emails + in-app), email-absent
  skip, idempotency-key namespacing, no-prefs in-app default, and in-app
  suppression when disabled.

## Decisions

- **Port in `@pickupvb/domain`, plain-string `kind`/`channel`.** Putting it in
  `@pickupvb/notifications` (with typed `NotificationKind`/`Channel`) would be
  more cohesive but force a `domain → notifications` (for a typed domain port) or
  `infrastructure → notifications` dependency. Keeping `domain` dependency-free
  (the Onion core) won out; the columns are text, and the typed registry is
  applied at the `notify()` boundary (which already imports
  `@pickupvb/notifications`). See ADR 0022 §1.
- **A testable `dispatch(port, …)` seam.** `notify()` is best-effort and
  silent-in-prod (it swallows so a notification failure can't break a signup) —
  exactly the "invisible in dev" path AGENTS.md says to pin with a test. Couldn't
  test it while it constructed the admin client inline, so the fan-out moved to
  an exported `dispatch` that takes the port; the fake-port test now encodes the
  channel-selection rules.
- **Failures are now logged, not silently dropped.** The old code did
  `await admin.from(...).insert(...)` without reading `{ error }`, so a row
  failure vanished. The adapter throws on error → `notify`'s `catch` logs it.
  Minor behavior change: a per-row failure now skips the remaining channels in
  that one call instead of being ignored per-channel — net safer (surfaced).
- **Service-role at the boundary, visible.** The adapter is client-injected and
  `notify()` constructs it with the admin client, so the session-less fan-out
  (pitfall #8's sanctioned admin case) stays explicit rather than buried.

## Changes

- Docs: `docs/adr/0022-notification-outbox-port.md` (new).
- Domain: `notifications/outbox-port.ts` + `notifications/index.ts` (new);
  `src/index.ts` exports them.
- Infra: `supabase-notification-outbox-repository.ts` (new) + barrel.
- Web: `lib/notify.ts` (refactor), `lib/notify.test.ts` (new).

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 267, application 42, web 55, infra 7; lint 0 errors). No DB change.

## Follow-ups (rest of the notification subdomain, P2-1 Fix #3)

- **Cron worker + purge** (`api/notifications/worker`, `outbox-purge`) — outbox
  read / claim / mark-sent / purge methods on the port (the drain side).
- **Push subscribe** (`api/notifications/subscribe`) — a `PushSubscriptionPort`
  (or methods on the same adapter) for `push_subscriptions`.
- **Broadcasts** (event/team `broadcast-actions.ts`, `_actions/hide-broadcast.ts`)
  — a `BroadcastPort`.
- **Preferences** (`profile/notifications` page + actions) — `notification_preferences`
  read/write (the prefs page write, distinct from `notify`'s read).
- Then the deferred `load-event-detail.ts` host-social-handles read — the last
  P2-1 remnant outside notifications.
