# 2026-05-29 — Bundle: Phase 2b (increment 9) — theme / hero / business writes

Continues the P2-1 profile-write drain. inc. 8 stood up the `UserProfile`
write aggregate + `SupabaseUserRepository` + `getUserProfileHandlers()`; this
increment drains the three remaining **profile-column** writes through that
same seam, per the [ADR 0020](../adr/0020-user-profile-write-aggregate.md)
migration table. (Friend-edge writes are a different shape — inc. 10.)

## What changed

The aggregate gained three more modeled columns + focused mutators:

- `themePreference` (`setTheme`) — cross-device theme; `'system'` stays a
  device cookie and never reaches the aggregate (column is `light | dark`).
- `heroImageUrl` (`setHeroImage`) — profile banner URL, nullable.
- `businessInfo` (`setBusinessInfo`) — the buyer-side receipt fields
  (`business_name` / `business_address` / `tax_id`).

`SupabaseUserRepository.findById`/`save` now round-trip those columns, and three
thin command handlers (`SetProfileThemeHandler`, `SetProfileHeroImageHandler`,
`UpdateBusinessInfoHandler`) join the per-request `getUserProfileHandlers()`
factory. The three actions migrated off raw `supabase.from('profiles').update(…)`:

- `theme-actions.ts` — cookie write stays at the boundary; the profile mirror
  routes through the handler.
- `hero-image-actions.ts` — **profile branch only**; the events/groups branches
  stay raw (different aggregates, out of scope).
- `profile/receipts/business-info-actions.ts`.

## Decisions

- **Followed the committed ADR's full-row save, didn't re-litigate it.** Per ADR
  0020 §3 each migrated column is modeled on the aggregate and persisted by
  `save()` (a full UPDATE of the modeled set). So `findById` now loads
  theme/hero/business and every `save()` re-writes them with their current
  values — a no-op in the common case. The profile row is owner-edited only, so
  the last-write-wins window (a concurrent toggle landing between another
  action's load and save) is sub-second and acceptable; we explicitly chose this
  over dirty-field tracking back in the ADR.
- **Theme stays best-effort — and inc. 9 quietly fixes a latent bug.** The old
  action did a fire-and-forget `update()` (the "ignore errors" comment was
  aspirational — it didn't actually catch). Routing through a handler that
  `findById`-then-throws `NotFoundError` would have **regressed** the
  anon-visitor case (an anon user may have no `profiles` row, so the toggle
  would throw). Wrapped the handler call in `try { … } catch { /* ignore */ }`
  so the toggle never blocks the UI — now matching the comment's intent.
- **Hero: migrate only the branch we own.** `saveHeroImageUrl` is a tri-entity
  action (events / groups / profiles). Only the profiles branch is a
  `UserProfile` concern; the events branch belongs to the event aggregate and
  groups to the future `GroupRepository` (Phase 3). Migrating just the profile
  branch keeps the bundle honest and leaves a comment marking why the others
  stay raw.
- **Form-state actions return, don't throw.** `business-info-actions` is a
  `useFormState` action, so it maps `NotFoundError` → "Profile not found." and
  any other failure → a generic "couldn't save" state (per the AGENTS.md
  client-invoked-action rule) rather than letting the repo's `Error` hit the
  React boundary. `theme`/`hero` already return their own shapes.
- **Thin handlers are fine.** `Set*Handler` just load → mutate → save with no
  extra logic. Kept them (rather than calling the repo from the action) so
  `getUserProfileHandlers()` stays the single, uniform write entry point — same
  shape as inc. 8, and the seam future rules would attach to.

## Changes

- Domain: `users/user-profile.ts` — `themePreference` / `heroImageUrl` /
  `businessInfo` fields + `setTheme` / `setHeroImage` / `setBusinessInfo` +
  getters; `create` / `fromPersistence` updated. `users/user-profile.test.ts` —
  mutator + rehydrate tests.
- Application: `messages.ts` — `SetProfileThemeCommand` /
  `SetProfileHeroImageCommand` / `UpdateBusinessInfoCommand`;
  `commands/user-profile.handler.ts` — three handlers.
- Infra: `supabase-user-repository.ts` — `findById` select+map + `save` payload
  extended with the five columns.
- Web: `lib/handlers.ts` — `getUserProfileHandlers()` returns the three new
  handlers; `theme-actions.ts`, `hero-image-actions.ts` (profile branch),
  `profile/receipts/business-info-actions.ts` migrated.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 239, application 42, web 50, infra 7; lint 0 errors). No DB change.

## Follow-ups (rest of Phase 2b, P2-1)

- **inc. 10 — friend writes.** `friends/actions.ts` add/remove +
  `players/[id]/_components/player-viewer-actions.tsx` → focused
  `addFriendEdge` / `removeFriendEdge` on `UserRepository` (ADR 0020 §5; the
  `friendships` edge table, not a `profiles` column — no whole-set reconcile).
- **`load-event-detail.ts` host social handles** — distinct read shape, still
  deferred.
- `GroupRepository` (Phase 3, ~28 raw hits) + the notification outbox — untouched.
