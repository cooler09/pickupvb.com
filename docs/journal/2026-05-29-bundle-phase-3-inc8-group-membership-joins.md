# 2026-05-29 — Bundle: Phase 3 (increment 8) — group membership joins + sitemap

The last group reads. Migrates the membership-join reads (my-groups,
hostable-groups) and the sitemap slug list behind `GroupQueries`. With this, the
groups subdomain (Phase 3) is effectively drained.

## What changed

- **Domain** (`groups/group-queries.ts`): `GroupMembership` (`{ group: GroupCard;
role }`) + `GroupSlugEntry` (`{ slug; updatedAt }`) read models, and three
  methods — `listMembershipsForUser`, `listManageableGroups`, `listSlugs`.
- **Infra** (`supabase-group-query-repository.ts`): all three. The membership
  reads use the nested single-valued `groups:groups!inner(<card columns>)` join
  (one `MEMBERSHIP_COLUMNS` constant + a `MembershipRow` narrowing type), filter
  null embeds, and `toCard` each. `listManageableGroups` adds
  `.in('role', ['owner','admin'])`. `listSlugs` filters `deleted_at is null`.
- **Web**: migrated off raw `group_members` / `groups` reads —
  [profile/page.tsx](../../apps/web/src/app/profile/page.tsx) (my groups + role),
  [events/new/page.tsx](../../apps/web/src/app/events/new/page.tsx) (hostable
  groups), [sitemap.ts](../../apps/web/src/app/sitemap.ts) (group slugs).

## Decisions

- **The nested join moves into the adapter.** The pages each inlined a
  `groups!inner(...)` select + a snake_case `Row` narrowing type + a null-embed
  filter. That join is the adapter's job now; the pages get clean `GroupCard` /
  `GroupMembership` read models and map to their component shapes (`MyGroup`,
  `{ id, name }`).
- **`GroupMembership` reuses `GroupCard`.** The profile "my groups" section wants
  `id/slug/name/avatarUrl/homeCity` + role — a `GroupCard` plus the role. One
  read model, the page maps it. `listManageableGroups` returns `GroupCard[]`
  (events/new uses `id`/`name`; the extra fields are a negligible over-fetch).
- **RLS still scopes the joins.** The membership reads are inherently
  user-scoped (`.eq('user_id', userId)`), run on the user client, so RLS hides
  soft-deleted groups from the `!inner` embed (a member of a deleted group
  doesn't see it) — matching the prior behavior. `listSlugs` filters
  `deleted_at` explicitly (defensive).
- **No new tests.** Read projections, no domain rule.

## Changes

- Domain: `groups/group-queries.ts` (2 read models + 3 methods).
- Infra: `supabase-group-query-repository.ts` (3 methods + `MEMBERSHIP_COLUMNS`).
- Web: `profile/page.tsx`, `events/new/page.tsx`, `sitemap.ts`.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 267, application 42, web 50, infra 7; lint 0 errors). No DB change.

## Where Phase 3 lands

The **groups subdomain is drained** — ADR 0021's Fix item #1 (stand up
`GroupRepository` + `Group` aggregate) is done:

- **Writes** (inc. 1–4): profile create/update, membership + last-owner
  invariant, follow edges, delete → `GroupRepository` + the `Group` aggregate.
- **Reads** (inc. 5–8): directory + home cards, find-one detail/metadata/OG/edit,
  roster + viewer-role, membership joins + sitemap → `GroupQueries`.

Documented exceptions that intentionally stay raw:

- `hero-image-actions.ts` groups branch — cross-aggregate (events/groups/profiles
  share the action); migrate with the event/hero work, not the group port.
- `group-viewer-actions.tsx` follow-state read — a browser-client island
  hydration read; can't use a server-side port.
- The admin soft-delete closure in `handlers.ts` — the sanctioned RLS-quirk
  bypass (owner authz enforced first; AGENTS.md pitfall #8).

## Remaining P2-1 (beyond groups)

- **Notification outbox** (`notification_outbox` / `broadcasts` /
  `push_subscriptions`) — a `NotificationOutboxPort`; a separate subdomain and
  the last big P2-1 chunk.
- The deferred `load-event-detail.ts` host-social-handles read (distinct shape,
  low value).
