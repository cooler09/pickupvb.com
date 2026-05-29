# 2026-05-29 — Bundle: Phase 3 (increment 7) — group roster + viewer-role reads

Continues the groups read drain. Migrates the members roster + the owner/admin
gate reads behind `GroupQueries`.

## What changed

- **Domain** (`groups/group-queries.ts`): a `GroupMemberCard` read model
  (`{ userId, role, profile: ProfileCard | null }`) and two methods —
  `listMembers(groupId)` and `findViewerRole(groupId, userId)`.
- **Infra** (`supabase-group-query-repository.ts`):
  - `listMembers` reads the `group_members` rows (ordered by `joined_at`) and
    resolves each member's profile card by **composing
    `ProfileQueries.findCardsByIds`** on the same client — `profiles_public` has
    no FK to join, so the merge happens in JS (the adapter-composes-adapter seam
    from the friend-edges work).
  - `findViewerRole` is a single-row role lookup.
- **Web**: migrated off raw `supabase.from('group_members')`:
  - [groups/[id]/page.tsx](../../apps/web/src/app/groups/%5Bid%5D/page.tsx) — the
    roster read + the `managerIds` / `GroupMember[]` mapping now derive from
    `listMembers`.
  - [groups/[id]/members/page.tsx](../../apps/web/src/app/groups/%5Bid%5D/members/page.tsx)
    — the group load (`findDetailBySlug`), the owner/admin gate
    (`findViewerRole`), and the roster (`listMembers`).
  - [groups/[id]/edit/page.tsx](../../apps/web/src/app/groups/%5Bid%5D/edit/page.tsx)
    — the role gate that inc. 6 had left raw now uses `findViewerRole`.

## Decisions

- **Compose, don't duplicate (the read-side seam).** `listMembers` owns the
  roster edge and delegates the profile-card projection to
  `ProfileQueries.findCardsByIds`, exactly as `SocialGraphQueries.getFriendEdges`
  did in Phase 2b inc. 6. Each port keeps owning its slice; the group reader
  lazily builds a `SupabaseProfileRepository` on its own client.
- **One `GroupMemberCard` shape, mapped per consumer.** The detail page wants
  `{ displayName, firstName, lastName, avatarUrl, handle }`; the members page
  wants the same minus `avatarUrl`. Both derive from `GroupMemberCard.profile`
  (a `ProfileCard`); `firstName` / `lastName` are `null` because they aren't part
  of the public card. Keeping the read model = roster + `ProfileCard` lets each
  page map to its own component shape at the boundary.
- **Members page group load → `findDetailBySlug` too.** It only needs
  `id/slug/name`, but reusing `findDetailBySlug` drains its last raw `groups`
  read for a negligible over-fetch — the whole page is now port-driven.
- **Closed the inc. 6 loose end.** The edit page's role gate was deliberately
  left raw in inc. 6 (roster work deferred); it now uses `findViewerRole`, so the
  edit page has no raw group reads left.
- **No new tests.** Read projections, no domain rule (`escapeLike` already
  pinned; the composition is exercised by the existing profile read tests).

## Changes

- Domain: `groups/group-queries.ts` (`GroupMemberCard` + `listMembers` +
  `findViewerRole`).
- Infra: `supabase-group-query-repository.ts` (both methods; composes
  `SupabaseProfileRepository`).
- Web: `groups/[id]/page.tsx`, `groups/[id]/members/page.tsx`,
  `groups/[id]/edit/page.tsx`.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 267, application 42, web 50, infra 7; lint 0 errors). No DB change.

## Follow-ups (rest of Phase 3 reads, P2-1)

- **My-groups / hostable-groups joins.** `profile/page.tsx` (groups the viewer
  belongs to, with role) and `events/new/page.tsx` (groups the viewer can host
  under — owner/admin only) both read `group_members` with a nested `groups`
  join → membership-scoped read methods on `GroupQueries` (e.g.
  `listMembershipsForUser(userId)` / `listManageableGroups(userId)`).
- **Sitemap** (`sitemap.ts`) → a lightweight `listSlugs()`.
- The shared `hero-image-actions.ts` groups branch stays raw (cross-aggregate);
  the deferred `load-event-detail.ts` host-social read + the notification outbox
  remain.
