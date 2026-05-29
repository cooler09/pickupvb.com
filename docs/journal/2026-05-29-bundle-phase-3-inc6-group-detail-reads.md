# 2026-05-29 — Bundle: Phase 3 (increment 6) — GroupQueries find-one reads

Continues the groups read drain (inc. 5 did the card lists). This migrates the
four "fetch one group by slug" reads behind the read port.

## What changed

- **Domain** (`groups/group-queries.ts`): a `GroupDetail` read model (`GroupCard`
  fields + `heroImageUrl` + `createdBy`) and `GroupQueries.findDetailBySlug(slug)`.
- **Infra** (`supabase-group-query-repository.ts`): `findDetailBySlug` (detail
  columns; filters `deleted_at is null`; `toDetail` composes `toCard`).
- **Web**: migrated off raw `supabase.from('groups')`:
  - [groups/[id]/page.tsx](../../apps/web/src/app/groups/%5Bid%5D/page.tsx) — the
    detail-page group load **and** `generateMetadata`; the page's own `group.*`
    refs are now camelCase.
  - [groups/[id]/edit/page.tsx](../../apps/web/src/app/groups/%5Bid%5D/edit/page.tsx)
    — the edit-page group load; `EditGroupForm`'s prop type + `defaultValue` refs
    flipped to camelCase to match.
  - [groups/[id]/opengraph-image.tsx](../../apps/web/src/app/groups/%5Bid%5D/opengraph-image.tsx)
    — routed through `findDetailBySlug`.

## Decisions

- **`GroupDetail` extends the card shape.** `toDetail` spreads `toCard` and adds
  `heroImageUrl` + `createdBy` — one mapper, no duplication. Metadata + OG use a
  subset of `GroupDetail` and just read the fields they need.
- **Drive-by bug fix: the OG image was broken.** It queried
  `.from('groups').eq('id', params.id)` — but the `[id]` route segment is the
  **slug** (the detail page reads `.eq('slug', …)`), so the lookup never matched
  and every group OG image fell back to the generic "Group" title. Routing it
  through `findDetailBySlug(params.id)` (same as the detail page) fixes it. Left a
  comment at the call site so it isn't "corrected" back to the id column.
- **Edit form cascade kept small.** The edit page passes the group straight into
  `EditGroupForm`, so the camelCase `GroupDetail` forced the form's prop type +
  three `defaultValue` refs to camelCase — a contained change (structural typing
  lets the richer `GroupDetail` satisfy the form's subset prop).
- **Roster + viewer-role gates deferred to inc. 7.** The detail and edit/members
  pages still read `group_members` (roster + the owner/admin gate) raw — that's
  the next read shape (`listMembers` composing `ProfileQueries.findCardsByIds`),
  so it lands as its own increment rather than half-migrating here.
- **No new tests.** Read projections, no domain rule.

## Changes

- Domain: `groups/group-queries.ts` (`GroupDetail` + `findDetailBySlug`).
- Infra: `supabase-group-query-repository.ts` (`findDetailBySlug` + `toDetail`).
- Web: `groups/[id]/page.tsx`, `groups/[id]/edit/page.tsx`,
  `groups/[id]/edit/edit-group-form.tsx`, `groups/[id]/opengraph-image.tsx`.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 267, application 42, web 50, infra 7; lint 0 errors). No DB change.

## Follow-ups (rest of Phase 3 reads, P2-1)

- **inc. 7 — members roster + viewer role.** `groups/[id]/page.tsx` +
  `members/page.tsx` `group_members` reads → `GroupQueries.listMembers(groupId)`
  (composing `ProfileQueries.findCardsByIds`, the adapter-composes-adapter seam)
  and a `findViewerRole(groupId, userId)` for the owner/admin gates.
- **My-groups / hostable-groups joins** (`profile/page.tsx`, `events/new/page.tsx`)
  → membership-scoped read methods.
- **Sitemap** (`sitemap.ts`) → a lightweight `listSlugs()`.
- The shared `hero-image-actions.ts` groups branch stays raw (cross-aggregate);
  the deferred `load-event-detail.ts` host-social read + the notification outbox
  remain.
