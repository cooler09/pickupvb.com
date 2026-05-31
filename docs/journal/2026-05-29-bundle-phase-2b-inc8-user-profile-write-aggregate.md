# 2026-05-29 — Bundle: Phase 2b (increment 8) — UserProfile write aggregate

The first **write** increment of the P2-1 drain. Reads were nearly fully
drained (inc. 1–7); this stands up the aggregate + repository the profile
writes route through. ADR-worthy, so it ships with [ADR 0020](../adr/0020-user-profile-write-aggregate.md).

## What changed

The orphan, anemic `UserProfile` aggregate (3 fields: `displayName`,
`homeCity`, `friends`; a declared-but-unimplemented `UserRepository`; imported
nowhere) is promoted to a real write aggregate that owns the user-editable
`profiles` columns the profile **edit form** + **handle editor** touch:
names, home city, handle, three positions, six social handles, and the
`autoAcceptTeamInvites` / `showProBadge` flags. Added `fromPersistence`
(rehydrate, no re-validation) + `editDetails` / `changeHandle` mutators. The
handle-format regex and the display-name-required rule **move into the domain**
(they were inline in the web action) — now executable invariants with tests.

`SupabaseUserRepository` (`findById`/`save`) implements the port: a single full
UPDATE of the modeled columns, `23505` → `ConflictError`. Wired per-request
behind `getUserProfileHandlers()` — a user-scoped factory mirroring
`getMatchResultHandlers()`. `profile/actions.ts` `updateProfile` + `updateHandle`
now build `UpdateProfileCommand` / `ChangeHandleCommand` and map the typed
errors back to their `useFormState` result shapes.

## Decisions

- **Slice it, don't boil the ocean.** The chosen scope migrates only
  `updateProfile` + `updateHandle`. The aggregate models exactly those columns;
  `theme_preference` / `hero_image_url` / `business_*` are **not** modeled yet,
  so `save()`'s column set stays narrow and the still-raw theme/hero/business
  actions keep their surgical partial updates — **no clobber during migration**.
  Each remaining write is a follow-up reusing this seam (ADR 0020 migration
  table).
- **User-scoped client, RLS is the gate.** A profile edit is a self-write, so
  the repo must run on `getServerSupabase()` (cookie-bound), not the
  module-singleton admin client — otherwise the `id = auth.uid()` policy never
  fires. Hence the per-request factory, not a singleton entry in `handlers`.
  Same lesson as security-audit P2 #4 / `getMatchResultHandlers()`.
- **Invariants belong in the aggregate.** Centralizing the handle shape +
  display-name rule in the domain is the point — the audit's whole P2-1 thesis
  is that these rules currently live (and drift) inline in actions. `changeHandle`
  throws `ValidationError`; the action maps it to the same user-facing message,
  so UX is unchanged.
- **Handle uniqueness → `ConflictError` at the adapter.** The DB unique
  constraint is the source of truth; the repo classifies `23505` and the action
  maps `ConflictError` → "handle already taken." Pinned by an `isUniqueViolation`
  infra unit test (mirrors the `escapeLike` precedent — pure exported helper).
- **`as never` write cast stays (infra only).** The `save()` payload keeps the
  documented infra Supabase-write cast (P2-5 scopes the `as never` ban to the
  pure layers); the _web_ `as never` casts on the two profile writes are **gone**.
- **Friends not loaded/persisted here.** `friendships` is a separate edge table;
  friend writes are a sequenced follow-up via focused `addFriendEdge` /
  `removeFriendEdge` repo ops (ADR 0020 §5), explicitly rejecting whole-set
  reconcile on `save()`. `fromPersistence` leaves the friend set empty.

## Changes

- Docs: `docs/adr/0020-user-profile-write-aggregate.md` (new).
- Domain: `users/user-profile.ts` — rich aggregate + `fromPersistence` /
  `editDetails` / `changeHandle`; `users/user-profile.test.ts` (new).
- Application: `messages.ts` — `UpdateProfileCommand` / `ChangeHandleCommand`;
  `commands/user-profile.handler.ts` (new) + barrel export.
- Infra: `supabase-user-repository.ts` (new) + `isUniqueViolation` +
  `supabase-user-repository.test.ts` (new) + barrel export.
- Web: `lib/handlers.ts` — `getUserProfileHandlers()`; `profile/actions.ts` —
  both writes migrated.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 234, application 42, web 50, infra 7; lint 0 errors). No DB change.

## Follow-ups (rest of Phase 2b, P2-1)

- **Theme write** (`theme-actions.ts`) → `setTheme` mutator + model
  `theme_preference`. Note the action also writes a device cookie and skips
  `'system'` — that stays at the boundary.
- **Hero image** (`hero-image-actions.ts`, profile branch only) → `setHeroImage`;
  the events/groups branches are out of scope (different aggregates).
- **Business info** (`profile/receipts/business-info-actions.ts`) →
  `setBusinessInfo`; receipt/tax fields, money-adjacent — keep its own bundle.
- **Friend writes** (`friends/actions.ts`, `players/[id]/.../player-viewer-actions.tsx`)
  → `addFriendEdge` / `removeFriendEdge` on `UserRepository`.
- **`load-event-detail.ts` L705 host social handles** — distinct read shape,
  still deferred.
- `GroupRepository` (Phase 3, ~28 raw hits) + the notification outbox — untouched.
