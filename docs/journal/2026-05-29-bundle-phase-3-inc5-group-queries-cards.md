# 2026-05-29 — Bundle: Phase 3 (increment 5) — GroupQueries read port (cards)

The groups **write** side is fully behind `GroupRepository` (inc. 1–4); this
opens the **read** side with a CQRS read port, mirroring the `ProfileQueries`
work from Phase 2b. Group reads are heterogeneous (directory cards, detail +
members, my-groups / hostable joins, sitemap, OG), so — like `ProfileQueries`
(7 read increments) — they drain across increments. This is the foundational
card slice.

## What changed

- **Domain** (`groups/group-queries.ts`, new): a `GroupQueries` read port +
  `GroupCard` read model + `GroupDirectoryQuery` / `GroupDirectoryPage`. Pure
  camelCase read shapes, no behavior (read side of CQRS).
- **Infra** (`supabase-group-query-repository.ts`, new): client-injected
  `SupabaseGroupQueryRepository` with `searchDirectory(query)` (paginated +
  optional name/slug/city search) and `listCards(limit)`. Filters
  `deleted_at is null` and reuses the shared `escapeLike` guard.
- **Web**: the two card-shaped sites migrated off raw `supabase.from('groups')`:
  the [groups directory](../../apps/web/src/app/groups/page.tsx) (search +
  pagination) and the [home-page rail](../../apps/web/src/app/page.tsx). Both
  render on camelCase `GroupCard` now (dropped their local snake_case `GroupRow`
  types).

## Decisions

- **Separate read port, not a method on `GroupRepository`.** Per the audit
  playbook ("keep read models off the write-side port") and the `ProfileQueries`
  vs. `UserProfile`/`UserRepository` precedent, the read side is its own port +
  its own adapter class. Reads go **directly** to the read adapter from the page
  (`new SupabaseGroupQueryRepository(supabase)`), no command-handler registry —
  the same pattern Phase 2b used for profile reads.
- **`GroupCard` shared by both sites.** The directory needs `description`; the
  home rail doesn't, but including it (and letting home ignore it) keeps one read
  model. Negligible over-fetch.
- **Reuse `escapeLike`, and improve on the prior code.** The old directory query
  interpolated the raw search term into `.or(name.ilike.%q%,…)` — no escaping at
  all. The port runs the term through the shared `escapeLike` (neutralises
  `%`/`_`), matching the profile-search precedent. (PostgREST `.or()` is still
  comma-sensitive — a pre-existing edge case, not in scope here.)
- **Explicit `deleted_at is null`.** The pages relied on RLS to hide
  soft-deleted groups; the adapter filters explicitly too, so it stays correct
  under any client (defensive, no behavior change with the anon/user client).
- **No new tests.** Pure read projections with no domain rule; `escapeLike` is
  already pinned by an infra unit test. Per AGENTS.md, skip.

## Changes

- Domain: `groups/group-queries.ts` (new); `groups/index.ts` exports it.
- Infra: `supabase-group-query-repository.ts` (new) + barrel.
- Web: `groups/page.tsx`, `page.tsx` (home) — directory + rail reads + camelCase
  render.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 267, application 42, web 50, infra 7; lint 0 errors). No DB change.

## Follow-ups (rest of Phase 3 reads, P2-1)

- **inc. 6 — find-one reads.** Group detail (`groups/[id]/page.tsx`),
  `generateMetadata`, OG image, and the edit-page load (by slug / id) → a
  `findBySlug` / `findById`-style read returning a `GroupDetail` (adds
  `heroImageUrl` + `createdBy`). The edit/members pages also gate on the viewer's
  role — that role lookup can ride along.
- **Members roster** reads (`groups/[id]/page.tsx`, `members/page.tsx`) →
  `GroupQueries.listMembers(groupId)` composing `ProfileQueries.findCardsByIds`
  (the adapter-composes-adapter seam from Phase 2b inc. 6).
- **My-groups / hostable-groups joins** (`profile/page.tsx`, `events/new/page.tsx`)
  → membership-scoped read methods.
- **Sitemap** (`sitemap.ts`) → a lightweight `listSlugs()`.
- The shared `hero-image-actions.ts` groups branch stays raw (cross-aggregate),
  and the deferred `load-event-detail.ts` host-social read + the notification
  outbox remain.
