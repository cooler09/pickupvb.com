# 2026-05-29 — Bundle: Phase 3 (increment 2) — group membership + last-owner invariant

The meaty slice of Phase 3: the `Group` aggregate gains its **membership
roster** with the role rules, and finally a home for the one membership
invariant nothing enforced before — a group can't lose its last owner.

## What changed

- **Domain** (`groups/group.ts`): `Group` now carries a roster
  (`Map<UserId, GroupRole>`) plus the loaded baseline. New behavior:
  - `addMember(actor, user, role)` — owner/admin only; adding an existing member
    is a `ConflictError`.
  - `removeMember(actor, user)` — owner/admin, or self-leave; refuses to remove
    the **last owner** (`InvariantViolation`); no-op for a non-member.
  - `changeMemberRole(actor, user, role)` — owner/admin; `NotFoundError` for an
    unknown target; refuses to demote the **last owner**.
  - `memberDiff()` — the delta vs. the loaded baseline (`added` / `removed` /
    `roleChanged`), which the repo persists.
- **Infra** (`supabase-group-repository.ts`): `findById` now loads the roster
  (`group_members`) alongside the group row; new `saveMembers(group)` applies
  `memberDiff` via focused per-row INSERT / DELETE / UPDATE.
- **Application**: `AddGroupMemberCommand` / `RemoveGroupMemberCommand` /
  `ChangeGroupMemberRoleCommand` + their handlers (load → mutate → `saveMembers`).
- **Web**: `getGroupHandlers()` returns the three; `member-actions.ts` migrated
  off raw `supabase.from('group_members')`, carrying the actor (session user) so
  the aggregate can authorize.

## Decisions

- **The last-owner invariant is the headline win.** RLS lets any owner/admin
  remove or demote any member, including the sole owner — orphaning the group.
  Now `removeMember` / `changeMemberRole` refuse it. This is exactly the kind of
  rule that had no home while membership lived in raw actions; it's the reason
  the aggregate is worth standing up.
- **Focused per-row writes (`saveMembers` + `memberDiff`), not clear-and-insert.**
  `Team`'s repo reconciles its roster by clear-and-insert, but that pattern is
  wrong for groups: (1) a member's **self-leave** can only DELETE their own row
  under RLS — a clear-all of the roster fails; (2) it would reset `joined_at`;
  (3) it would clobber rows added concurrently. The diff against the loaded
  baseline yields exactly the rows that changed, each a single-row write that
  RLS evaluates per row.
- **Membership persists via `saveMembers`, not `save()`.** `save()` writes the
  `groups` profile row (owner/admin RLS) — a plain member's self-leave can't
  touch it. Keeping member persistence on its own method (that never touches the
  `groups` row) is what lets self-leave work. Documented on the aggregate so a
  future reader doesn't route members through `save`.
- **`findById` always loads the roster.** The aggregate boundary includes its
  members, so `findById` loads them even for the profile-edit path (which
  ignores them). One extra small query; keeps the aggregate complete and honest.
- **Authorization matches RLS; the aggregate adds defense-in-depth + the new
  invariant.** `requireManager` = owner/admin (same as the RLS policies); the
  writes still run on the user-scoped client so RLS is the real gate. We did
  **not** add a stricter "only an owner may grant owner" rule — that would change
  behavior beyond this increment (the UI already gates the owner-grant button to
  owner viewers); noted as a possible future tightening.
- **Preserve the silent-block UX.** The three actions are plain
  `<form action>` submissions that previously ignored the write error (so an
  unauthorized attempt was a no-op). The migrated actions swallow expected
  `DomainError`s (unauthorized / last-owner / conflict / not-found) and bubble
  only unexpected failures — so the new invariant blocks silently (strictly safer
  than the old "succeed and orphan") without throwing users into an error
  boundary.

## Changes

- Domain: `groups/group.ts` (roster + methods + `memberDiff`; `fromPersistence`
  gains `members`); `groups/group.test.ts` (+15 cases).
- Application: `messages.ts` (3 commands); `commands/group.handler.ts` (3 handlers).
- Infra: `supabase-group-repository.ts` (`findById` roster load + `saveMembers`).
- Web: `lib/handlers.ts` (`getGroupHandlers()` +3); `groups/member-actions.ts`.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 265, application 42, web 50, infra 7; lint 0 errors). No DB change.

> Note: `tsc --noEmit` typecheck excludes `*.test.ts`, so a stale inc-1 test
> calling `fromPersistence` without the new `members` field slipped past
> typecheck and was caught by the Vitest run — fixed in the same bundle.

## Follow-ups (rest of Phase 3, P2-1)

- **inc. 3 — follow edges.** `follow-actions.ts` → focused
  `addFollowEdge` / `removeFollowEdge` on `GroupRepository` (the friendships /
  ADR 0020 §5 shape; `group_followers` is self-only under RLS).
- **inc. 4 — delete.** Fold `delete-actions.ts` (keep its upcoming-events guard +
  admin-client soft-delete) onto the aggregate.
- **Reads** (`groups/**` pages, `sitemap`, `profile`, `events/new`) → a
  `GroupQueries` read port.
- The shared `hero-image-actions.ts` groups branch stays raw (cross-aggregate).
