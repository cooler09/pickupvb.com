# 0020. The `UserProfile` aggregate owns user-editable profile writes

- **Status:** Accepted
- **Date:** 2026-05-29
- **Relates to:** [ADR 0001 — Hexagonal architecture with CQRS-lite](0001-hexagonal-cqrs.md)
- **Addresses:** [architecture audit P2-1 (2026-05-29) — web layer bypasses the hexagonal boundary](../audits/architecture.md#p2-1-web-layer-bypasses-the-hexagonal-boundary-76-files-of-raw-supabasefrom--highest-roi-finding-)

## Context

The [2026-05-29 re-audit](../audits/architecture.md#reevaluation--2026-05-29)
graded as **P2-1** the fact that whole entity families — profiles, friendships,
groups, notifications — have **no domain model and no port**, so their reads and
writes live inline in pages and `*-actions.ts` as raw `supabase.from(...)`
queries laundered through `as never` casts.

Phase 2b drained the profile/friend **reads** behind a focused `ProfileQueries`
read port + `SupabaseProfileRepository` (reads the PII-safe `profiles_public`
view) and a `SocialGraphQueries` port for the friend graph. The **writes** were
deferred as the next substantive piece, because they need an aggregate, not a
read model.

A `UserProfile` aggregate already existed ([user-profile.ts](../../packages/domain/src/users/user-profile.ts))
but was **orphaned and anemic** — it modeled only `displayName`, `homeCity`,
and a `friends` set, declared a `UserRepository` port that nothing implemented,
and was imported nowhere. Meanwhile the real `public.profiles` row has ~25
user-editable columns (names, handle, three positions, six social handles, two
preference flags, theme, hero image, three receipt/business fields), and every
edit hit the table raw:

- [profile/actions.ts](../../apps/web/src/app/profile/actions.ts) — `updateProfile`
  (name / city / positions / social handles / prefs) and `updateHandle`
  (handle uniqueness).
- [theme-actions.ts](../../apps/web/src/app/theme-actions.ts) `setTheme`,
  [hero-image-actions.ts](../../apps/web/src/app/hero-image-actions.ts) profile
  branch, [profile/receipts/business-info-actions.ts](../../apps/web/src/app/profile/receipts/business-info-actions.ts)
  `updateBusinessInfo`.
- [friends/actions.ts](../../apps/web/src/app/friends/actions.ts) — `addFriend`
  / `removeFriend` (the `friendships` edge table).

The handle-format rule (`/^[a-z0-9][a-z0-9-]{1,63}[a-z0-9]$/`) and the
display-name-required rule lived as ad-hoc checks in the web action — domain
invariants with no test seam.

## Decision

**Promote `UserProfile` to a real write aggregate that owns the user-editable
profile row, give it a `UserRepository` implementation, and route profile
writes through application command handlers — migrated incrementally, one
concern per bundle.**

### 1. Aggregate shape (grows per increment)

`UserProfile` owns the columns it has migrated. To keep the surface coherent,
related columns are grouped into plain value objects:

- `positions: { primary, secondary, tertiary }` (`string | null` each)
- `socialHandles: { instagram, tiktok, twitter, facebook, youtube, website }`

plus scalar `displayName` (required), `firstName` / `lastName` / `homeCity`
(nullable), `handle`, and the `autoAcceptTeamInvites` / `showProBadge` flags.
`theme_preference`, `hero_image_url`, and the `business_*` columns are **not**
modeled in this first increment — they migrate in their own follow-up bundles.

Two factories, mirroring the rest of the domain:

- `create(...)` — validates (new profiles; onboarding).
- `fromPersistence(...)` — rehydrates a DB row **without** re-validating.

### 2. Invariants move into the aggregate

- `editDetails({...})` — display name must be non-empty (`ValidationError`).
- `changeHandle(handle)` — enforces the handle format in the domain
  (`ValidationError`), so the same rule can't drift between the form and any
  future caller. Normalization (lower-casing, stripping `@`/URL prefixes,
  trimming) stays at the **web boundary** per AGENTS.md — the aggregate
  receives already-normalized values and validates the _shape_.
- `addFriend` / `removeFriend` keep their existing self-friend guard.

### 3. `save()` semantics — full UPDATE of the modeled columns

`SupabaseUserRepository.save(profile)` issues a single `UPDATE … .eq('id', …)`
covering exactly the columns the aggregate currently models. Because the modeled
set grows per increment, `save()` does **not** touch theme / hero / business
columns yet, so the still-raw actions that write those keep their surgical
partial updates — no clobber during the migration. A unique-violation on
`handle` (`23505`) is mapped to `ConflictError` at the adapter boundary.

The profile row is **edited only by its owner**, so last-write-wins across a
`findById → mutate → save` round-trip is acceptable; we explicitly do **not**
add dirty-field tracking.

### 4. User-scoped, RLS-enforced — a per-request handler factory

Profile writes run under the caller's session so the
`profiles` RLS policy (`id = auth.uid()`) is the real authorization gate. They
therefore must **not** use the module-singleton admin-client handlers. Following
the `getMatchResultHandlers()` precedent
([handlers.ts](../../apps/web/src/lib/handlers.ts)), a new
`getUserProfileHandlers()` builds `SupabaseUserRepository(userClient)` +
`UpdateProfileHandler` / `ChangeHandleHandler` per request around the
`getServerSupabase()` client.

### 5. Friend-edge writes — focused repository operations (follow-up)

The `friendships` table is a separate edge table, not a `profiles` column. When
the friend-write increment lands, `UserRepository` gains
`addFriendEdge(viewerId, friendId)` / `removeFriendEdge(viewerId, friendId)` —
a single INSERT/DELETE — with the aggregate's `addFriend` / `removeFriend`
acting as the invariant guard. We deliberately reject reconciling the whole
`_friends` set on every `save()` (a single "add friend" would rewrite the entire
edge set and risk clobbering concurrent changes). Not in this bundle.

### 6. Incremental migration plan

| Increment       | Action(s) migrated                  | Aggregate gains                                       |
| --------------- | ----------------------------------- | ----------------------------------------------------- |
| **This bundle** | `updateProfile`, `updateHandle`     | core editable fields + `editDetails` / `changeHandle` |
| Follow-up       | `setTheme`                          | `theme` + `setTheme`                                  |
| Follow-up       | `saveHeroImageUrl` (profile branch) | `heroImageUrl` + `setHeroImage`                       |
| Follow-up       | `updateBusinessInfo`                | `business*` + `setBusinessInfo`                       |
| Follow-up       | `addFriend` / `removeFriend`        | `addFriendEdge` / `removeFriendEdge` repo ops         |

## Consequences

- **Easier:** profile writes get a test seam (the handle + display-name rules
  are now domain-tested), the `as never` write casts leave the web layer, and
  the `49 vs 76` boundary ratio improves. Each follow-up is a small, independent
  bundle that reuses the same aggregate + factory.
- **Harder / watch out:** the aggregate and `save()` column set grow across
  bundles — the in-progress state is "owns some profile columns, not all," which
  is intentional but must be read against this table. `updateHandle` now writes
  the full modeled column set (rehydrated values) rather than only `handle`;
  acceptable for an owner-only row.
- **Committed to:** new profile-edit features extend the aggregate + a command
  handler, not a raw `supabase.from('profiles')` write.
- **Not solved:** the `load-event-detail.ts` host-social-handles read (a distinct
  read shape, deferred); the theme/hero/business/friend writes (sequenced above);
  `GroupRepository` and the notification outbox (separate Phase 3+ bundles).

## Alternatives considered

- **One big-bang bundle migrating every profile write at once.** Rejected for
  this pass in favor of the established Phase 2b increment cadence — smaller,
  independently verify-clean diffs, lower risk on the money-adjacent receipt
  fields.
- **Dirty-field tracking so `save()` writes only changed columns.** The
  "correct" answer for a wide row written by multiple concerns, but heavier than
  warranted for an owner-only row; the incremental modeled-column approach gives
  the same no-clobber property during migration without the bookkeeping.
- **Skip the aggregate; add a thin `ProfileWriteRepository` with per-field
  update methods.** Rejected — it would repeat the anemic-model trap the audit
  flagged and leave the handle/display-name invariants homeless.
- **Reconcile the whole friend set on `save()`** (see §5). Rejected as a footgun.
