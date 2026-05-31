# 2026-05-29 — Bundle: host social-handles read (Phase 2b remnant)

Closes the one profile read deferred since Phase 2b inc. 7 — the primary host's
social handles on the event detail page. Small, but it also clears a latent bug.

## What changed

- **Domain** (`users/profile-queries.ts`): a `ProfileSocialLinks` read model
  (the six public social fields) + `ProfileQueries.findSocialLinksById(id)`.
- **Infra** (`supabase-profile-repository.ts`): `findSocialLinksById` reads the
  social columns from `profiles_public`.
- **Web** (`events/[id]/_loaders/load-event-detail.ts`): `loadPrimaryHostSocialCached`
  now resolves the admin client via dynamic `import('@/lib/supabase-admin')`
  inside the `unstable_cache` callback and calls
  `new SupabaseProfileRepository(admin).findSocialLinksById(hostUserId)`. The old
  `loadPrimaryHostSocialFresh` (raw `profiles_public` read) is deleted.

## Decisions

- **Drive-by fix: cookies inside `unstable_cache`.** `loadPrimaryHostSocialFresh`
  called `getServerSupabase()` (which reads cookies) from inside
  `loadPrimaryHostSocialCached`'s `unstable_cache` — the exact pattern AGENTS.md
  forbids ("the cached helper will throw or return an empty payload"). The host's
  public social links are viewer-independent, so the fix is the documented one:
  use the **admin** client via dynamic import inside the cache callback (the same
  shape the tip-total and captain-name cached loaders already use). Migrating to
  the port fixed the boundary and the bug together.
- **A dedicated `ProfileSocialLinks` read model.** It's deliberately narrow (just
  the social fields) rather than reusing the richer `PlayerProfile` — the caller
  only needs socials by id, and the shape is structurally identical to the web
  `SocialHandles` type so the view-model assignment needs no mapping.
- **No new tests.** Read projection, no domain rule.

## Changes

- Domain: `users/profile-queries.ts` (`ProfileSocialLinks` + `findSocialLinksById`).
- Infra: `supabase-profile-repository.ts` (`findSocialLinksById` + `SOCIAL_COLUMNS`).
- Web: `events/[id]/_loaders/load-event-detail.ts` (cached loader → port; raw
  fresh loader deleted).

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 267, application 42, web 55, infra 7; lint 0 errors). No DB change.

## Where P2-1 stands

The **profiles + friendships** surface is now fully drained (reads + writes) —
no deferred remnants. The **groups** subdomain is drained. The only P2-1 work
left is the rest of the **notification** subdomain:

- Push subscribe (`api/notifications/subscribe`) — add `upsert` to
  `PushSubscriptionPort`.
- Broadcasts (event/team `broadcast-actions.ts`, `_actions/hide-broadcast.ts`) —
  a `BroadcastPort`.
- Preferences (`profile/notifications` page + actions).
