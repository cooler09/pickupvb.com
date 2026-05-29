# 2026-05-29 — Bundle: Phase 3 (increment 1) — Group aggregate + create/update

Opens Phase 3 of the P2-1 drain: the **groups** subdomain (~28 raw
`groups`/`group_members`/`group_followers` hits, no domain model). This first
slice stands up the `Group` aggregate + `GroupRepository` and migrates the group
**profile** writes (create/update), mirroring the ADR 0020 / UserProfile cadence.
Net-new modeling, so it ships with [ADR 0021](../adr/0021-group-aggregate-and-repository.md).

## What changed

- **Domain** (`packages/domain/src/groups/`, new folder): a `Group` aggregate
  owning the profile fields (`slug`, `name`, `description`, `homeCity`, `region`,
  `avatarUrl`, `createdBy`) with `create` / `fromPersistence` / `editProfile`. New
  `GroupId` brand + `GroupRole` (`owner | admin | member`). The name (1–80) and
  slug-format rules moved into the domain as field-tagged `ValidationError`s
  (`{ field: 'name' | 'slug' }`).
- **Application**: `CreateGroupCommand` / `UpdateGroupProfileCommand` +
  `CreateGroupHandler` (generates the id via `randomUUID`, returns `{ id, slug }`)
  / `UpdateGroupProfileHandler` (loads → `editProfile` → save, returns `{ slug }`).
- **Infra**: `SupabaseGroupRepository` — `findById` (filters `deleted_at is null`),
  `add` (INSERT; slug `23505` → `ConflictError`), `save` (UPDATE of the modeled
  profile columns + `updated_at`).
- **Web**: `getGroupHandlers()` — a per-request, user-scoped factory (the
  `getUserProfileHandlers()` precedent). `group-form-actions.ts`
  `createGroupAction` + `updateGroupAction` migrated off raw
  `supabase.from('groups')`.

## Decisions

- **`add` vs `save`, not one upsert.** Create is a true INSERT that must surface
  the slug-uniqueness collision as a typed `ConflictError` and set `created_by`;
  update must never touch `created_by`/`slug`. A single upsert blurs both and
  complicates the founding-owner trigger interaction, so the port has two
  methods.
- **The founding-owner trigger stays; the aggregate doesn't model the roster
  (yet).** `on_group_created` inserts the owner `group_members` row on INSERT.
  Modeling + reconciling the roster on create would double-insert against the
  trigger, so increment 1 models only the `groups` row. The roster (with the
  **last-owner invariant** — a rule nothing enforces today) is the next
  increment, where `save` will diff-reconcile members so it neither re-inserts
  the trigger's owner nor clobbers `joined_at`.
- **User-scoped client, RLS is the gate.** Group writes run on
  `getServerSupabase()` so `groups_insert` (`created_by = auth.uid()`) and
  `groups_update` (owner/admin) enforce — never the admin singleton (AGENTS.md
  pitfall #8). `getGroupHandlers()` builds the repo per request.
- **Validation moved into the domain, field tags preserved.** The action's
  inline name-length + slug-regex checks are now aggregate invariants; the
  action maps the field-tagged `ValidationError` back to the form's `fieldErrors`
  shape, so the create/edit form UX is unchanged.
- **`updateGroupAction` now loads then saves.** It drops the blind UPDATE + the
  post-update slug re-lookup; instead `findById` → `editProfile` → `save`, and the
  handler returns the slug for `revalidatePath`. Same query count; a missing group
  now surfaces `NotFoundError` instead of silently no-op'ing. `redirect()` in
  create stays **outside** the try/catch so its control-flow throw isn't swallowed.

## Changes

- Docs: `docs/adr/0021-group-aggregate-and-repository.md` (new).
- Domain: `groups/group.ts` + `groups/index.ts` (new); `src/index.ts` exports
  `groups`. `groups/group.test.ts` (new, 10 cases).
- Application: `messages.ts` — `CreateGroupInput` / `CreateGroupCommand` /
  `UpdateGroupProfileCommand`; `commands/group.handler.ts` (new) + barrel.
- Infra: `supabase-group-repository.ts` (new) + barrel.
- Web: `lib/handlers.ts` — `getGroupHandlers()`; `groups/group-form-actions.ts`
  migrated.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 250, application 42, web 50, infra 7; lint 0 errors). No DB change.

## Follow-ups (rest of Phase 3, P2-1)

- **inc. 2 — membership.** `member-actions.ts` add/remove/changeRole →
  roster on the aggregate + role rules + the **last-owner invariant**; `save`
  diff-reconciles `group_members`.
- **inc. 3 — follow edges.** `follow-actions.ts` → focused
  `addFollowEdge` / `removeFollowEdge` repo ops (the friendships/ADR 0020 §5
  shape).
- **inc. 4 — delete.** Fold `delete-actions.ts` (keep its upcoming-events guard +
  admin-client soft-delete; already typed-error clean) onto the aggregate.
- **Reads** (`groups/**` pages, `sitemap`, `profile`, `events/new`) → a
  `GroupQueries` read port, opportunistically.
- The shared `hero-image-actions.ts` groups branch stays raw (cross-aggregate).
