# 0021. `Group` aggregate + `GroupRepository` — draining the groups subdomain

- **Status:** Accepted
- **Date:** 2026-05-29
- **Relates to:** [ADR 0001 — Hexagonal architecture with CQRS-lite](0001-hexagonal-cqrs.md), [ADR 0020 — UserProfile write aggregate](0020-user-profile-write-aggregate.md)
- **Addresses:** [architecture audit P2-1 (2026-05-29) — web layer bypasses the hexagonal boundary](../audits/architecture.md#p2-1-web-layer-bypasses-the-hexagonal-boundary-76-files-of-raw-supabasefrom--highest-roi-finding-) (Phase 3 of the roadmap)

## Context

The [2026-05-29 re-audit](../audits/architecture.md#reevaluation--2026-05-29) graded
the porous web-layer DB boundary as **P2-1**, naming **groups** as one of the
subdomains with _no domain model and no port_ — ~28 raw
`groups` / `group_members` / `group_followers` queries spread across pages and
`*-actions.ts`, with the role rules living only in RLS and inline action code.
Phase 2 closed the profiles/friendships slice behind `UserProfile` +
`ProfileQueries` + `SocialGraphQueries` (ADR 0020); Phase 3 is groups.

The subdomain (migration `20260513000700_groups_and_co_hosts.sql`):

- `groups` — `slug` (unique, `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`), `name`
  (1–80), `description` (default `''`), `avatar_url`, `home_city`, `region`,
  `created_by`, `hero_image_url`, soft-delete `deleted_at`.
- `group_members` — `(group_id, user_id, role)` with `role` ∈
  `owner | admin | member`, PK `(group_id, user_id)`.
- `group_followers` — `(group_id, user_id)` follow edges, PK `(group_id, user_id)`.
- A `SECURITY DEFINER` trigger `on_group_created` inserts the **founding owner**
  `group_members` row automatically when a group is created.

RLS already encodes the authorization: insert `created_by = auth.uid()`; group
update owner/admin; group delete owner; member insert/update owner/admin; member
delete self-or-owner/admin; follower edges self-only. **One real rule is _not_
enforced anywhere: a group must always keep at least one owner** — today an
owner/admin can remove or demote the last owner and orphan the group.

## Decision

**Stand up a `Group` aggregate + a `GroupRepository` port (user-scoped, so RLS
stays the authorization gate), and migrate the raw group writes onto it
incrementally — one concern per increment, mirroring the ADR 0020 cadence.**

### 1. Aggregate shape (grows by increment)

The `Group` aggregate owns the columns whose write path has been migrated.

- **Increment 1 (this bundle): the group _profile_.** `id` (`GroupId` brand),
  `slug`, `name`, `description`, `homeCity`, `region`, `avatarUrl`, `createdBy`.
  Factories `create` (validates) / `fromPersistence` (rehydrate, no
  re-validation); a `editProfile` mutator. The name (1–80) and slug-format rules
  move **into the domain** (they were inline regex/length checks in the action),
  thrown as `ValidationError` with a `{ field }` detail so the form can target it.
- **Later increments:** the **membership roster** (`Map<UserId, GroupRole>`)
  with role rules + the last-owner invariant; the **follow graph** as focused
  edge ops; **soft-delete**.

`hero_image_url` stays out of the aggregate for now (written by the shared
`hero-image-actions.ts`, which spans events/groups/profiles — its own concern).

### 2. `GroupRepository` — `add` vs `save`, user-scoped

```ts
interface GroupRepository {
  findById(id: GroupId): Promise<Group | null>;
  add(group: Group): Promise<void>; // INSERT; maps slug 23505 → ConflictError
  save(group: Group): Promise<void>; // UPDATE of the modeled profile columns
}
```

Two methods, not one upsert: **create** is a true INSERT (it must surface the
slug-uniqueness conflict as a typed `ConflictError`, and it fires the
founding-owner trigger), while **update** must not touch `created_by` / `slug`.
Like `SupabaseUserRepository`, the adapter **requires** a client — group writes
run under the caller's session so RLS (`created_by = auth.uid()` on insert,
owner/admin on update) is the real gate. They are wired per request behind a new
`getGroupHandlers()` factory (the `getMatchResultHandlers()` /
`getUserProfileHandlers()` precedent), **never** the module-singleton
admin-client `handlers` (AGENTS.md pitfall #8).

### 3. The founding-owner trigger stays; the aggregate doesn't manage the roster on create

`Group.create` + `repo.add` insert only the `groups` row; the existing
`on_group_created` trigger inserts the owner `group_members` row. The aggregate
does **not** model or write the roster in increment 1, so there's no
double-insert against the trigger. When the membership increment lands, `save`
will reconcile the roster by **diffing** against the persisted rows (so it
neither re-inserts the trigger's founding owner nor clobbers `joined_at`), and
the last-owner invariant becomes an aggregate guard.

### 4. Incremental migration plan

| Increment       | Action(s) migrated                                                                                                                      | Aggregate gains                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **This bundle** | `createGroupAction`, `updateGroupAction` ([group-form-actions.ts](../../apps/web/src/app/groups/group-form-actions.ts))                 | profile fields + `create` / `editProfile`                                                 |
| Follow-up       | `addGroupMember` / `removeGroupMember` / `changeGroupMemberRole` ([member-actions.ts](../../apps/web/src/app/groups/member-actions.ts)) | membership roster + role rules + **last-owner invariant**                                 |
| Follow-up       | `followGroup` / `unfollowGroup` ([follow-actions.ts](../../apps/web/src/app/groups/follow-actions.ts))                                  | focused `addFollowEdge` / `removeFollowEdge` repo ops (ADR 0020 §5 shape)                 |
| Follow-up       | `deleteGroupAction` ([delete-actions.ts](../../apps/web/src/app/groups/%5Bid%5D/edit/delete-actions.ts))                                | `softDelete` (keep its event-guard + admin-client soft-delete; already typed-error clean) |
| Opportunistic   | the read sites (`groups/**` pages, `sitemap`, `profile`)                                                                                | a `GroupQueries` read port                                                                |

## Consequences

- **Easier:** group create/update get a domain test seam (name/slug rules) and
  the `as never` write casts leave the action; the `49 vs 76` boundary ratio
  improves. Each follow-up is a small independent bundle reusing the aggregate +
  factory. The membership increment finally gives the **last-owner invariant** a
  home.
- **Harder / watch out:** the aggregate + `save()` column set grow across
  bundles — the in-progress state ("owns the profile, not yet the roster") must
  be read against the table above. `updateGroupAction` now loads the group
  (`findById`) before saving (one extra read) instead of a blind UPDATE — but it
  drops the post-update slug re-lookup, so query count is unchanged and a
  missing group now surfaces `NotFoundError` instead of silently no-op'ing.
- **Committed to:** new group-write features extend the aggregate + a command
  handler, not a raw `supabase.from('groups')` write.
- **Not solved this bundle:** the membership/follow/delete writes and the group
  read sites (sequenced above); the shared `hero-image-actions.ts` groups branch.

## Alternatives considered

- **One big-bang bundle for the whole subdomain.** Rejected for the same reason
  as ADR 0020 — the membership roster (reconcile + last-owner invariant) is a
  genuine design piece that deserves its own increment; bundling it with the
  trivial profile writes would balloon the diff and the risk.
- **Single `save()` upsert instead of `add` + `save`.** Rejected: create must
  surface slug conflicts as a typed error and must set `created_by` (which update
  must never touch); a one-method upsert blurs both and complicates the trigger
  interaction.
- **Enforce group authorization in the application layer on an admin client.**
  Rejected — that's AGENTS.md pitfall #8. The writes run on the user-scoped
  client so RLS enforces; the aggregate guards (e.g. last-owner, once the roster
  lands) are defense-in-depth, not the primary gate.
