# 2026-05-29 — Bundle: Phase 4 (increment 5) — notification preferences

The last named notification surface. Moves the settings page
(`profile/notifications`) read + write behind a port — completing the
notification subdomain and, with it, all three P2-1 fix items.

## What changed

- **Domain** (`notifications/preferences-port.ts`, new): a user-scoped
  `NotificationPreferencesPort` (`find` / `upsertChannels`) +
  `NotificationPreferenceSettings` + `NotificationChannelToggles`.
- **Infra** (`supabase-notification-preferences-repository.ts`, new):
  `SupabaseNotificationPreferencesRepository` (client-injected, used with the
  viewer's session client).
- **Web**: the [prefs page](../../apps/web/src/app/profile/notifications/page.tsx)
  read → `find` (and the page now consumes the camelCase settings directly,
  dropping its snake_case `Prefs` type); the
  [action](../../apps/web/src/app/profile/notifications/actions.ts) upsert →
  `upsertChannels`.

## Decisions

- **A separate preferences port (ISP), not the fan-out's `loadPreferences`.**
  The settings page is a **user-scoped** read/write of the viewer's own row and
  exposes a different shape (`smsOptedInAt`, no `channelOverrides`) than the
  admin fan-out projection. Different concern, different client, different shape
  → its own port. `notification_preferences` is now read by two ports — the
  admin fan-out (`NotificationOutboxPort.loadPreferences`) and this user-scoped
  settings port — same table, distinct projections (the
  `SupabaseProfileRepository` / `SupabaseUserRepository` split precedent).
- **Best-effort save preserved.** The old action `await`ed the upsert without
  reading its error (silent on failure). The migrated action swallows the
  adapter's throw to keep that fire-and-forget behavior (noted as a candidate to
  surface later) rather than changing a settings save into an error-boundary hit.
- **Page simplified to camelCase.** The render only used email/in-app/push, so
  the page computes those three booleans from the settings (with the no-row
  defaults) and drops the unused snake_case `Prefs` type + the sms fields.
- **No new tests.** Thin read/upsert, no domain rule.

## Changes

- Domain: `notifications/preferences-port.ts` (new) + barrel.
- Infra: `supabase-notification-preferences-repository.ts` (new) + barrel.
- Web: `profile/notifications/page.tsx`, `profile/notifications/actions.ts`.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 267, application 42, web 55, infra 7; lint 0 errors). No DB change.

## P2-1 status — all three named fixes complete

The architecture audit's P2-1 (web layer bypasses the hexagonal boundary) had
three prioritized fix items; all are now done:

1. **`GroupRepository` + `Group` aggregate** (+ `GroupQueries`) — ADR 0021. The
   groups subdomain (profile, membership + last-owner invariant, follow, delete,
   all reads) is drained.
2. **`UserProfile` aggregate + `ProfileRepository`/`ProfileQueries` +
   `SocialGraphQueries`** — ADR 0020. Profiles/friendships reads + writes drained.
3. **`NotificationOutboxPort` + siblings** — ADR 0022. `notify` fan-out, outbox
   drain/purge, push subscribe/prune, broadcasts, and prefs — all behind ports.

**Residue** (the finding's explicit lower-priority reads, deliberately left):

- In-app notification **bell** reads — `notification-bell.tsx` (client island,
  can't use a server port) + `site-header.tsx` unread count (a small
  viewer-scoped read).
- Event payment **sidecars** — `event_tips` / `event_sponsors` /
  `event_payment_audit` / `event_participant_payments`. These are payment-read
  surfaces the finding grouped under "don't boil the ocean"; a future pass could
  give them read ports if they grow rules or call sites.
