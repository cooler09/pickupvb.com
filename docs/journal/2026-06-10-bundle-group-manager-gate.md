# Shared `requireGroupManager` page gate — GD-5 (2026-06-10)

## Context

Follow-on to the [GD-1/2/3/7/9 bundle](2026-06-10-bundle-groups-detail-ux.md);
closes **GD-5** in [groups-page-ux.md](../audits/groups-page-ux.md). The same
"resolve the `[id]` slug → group, require a signed-in owner/admin, else
redirect" gate existed in **four** page shapes: edit + members via the read-model
adapter (`findDetailBySlug` + `findViewerRole`), and billing + analytics
hand-rolled with **inline raw** `groups` + `group_members` queries (casting the
result to an ad-hoc `{ id, name }`). Four copies = four chances to drift on an
authorization path — already the pages `select`ed different column sets.

## Decisions

- **One server-only page helper, not a hook or a HOC.**
  [`requireGroupManager(slug, nextPath)`](../../apps/web/src/app/groups/[id]/_lib/require-group-manager.ts)
  (under `[id]/_lib/`, matching the `tools/_lib/load-event-tool-context.ts` and
  `analytics/_loaders/` co-location pattern) does the gate and returns
  `{ supabase, groupQueries, group, role, userId }`. Page components `await` it
  as the first line and destructure only what they use.
- **Return the client + adapter, not just the gate result.** The members page
  needs `listMembers` _after_ the gate; returning the already-built
  `groupQueries` (and the `supabase` client behind it) lets it reuse them
  instead of re-constructing. `getServerSupabase` is `React.cache`-wrapped, so
  even though the helper and a caller could both call it, it's **one client per
  request** — the return is for ergonomics, not to dodge a second client.
- **Billing + analytics now read a typed `GroupDetail`.** Dropping the inline
  raw queries means they get `findDetailBySlug`'s typed row (id, slug, name,
  description, …) instead of a `groupRow as { id, name }` cast — a few extra
  columns, all cheap, and no more snake_case-cast drift at the page boundary.
- **Left the billing _actions_' `requireGroupManager` as a separate helper.**
  It runs in a `'use server'` action context: it uses `requireRealUser` (the
  anon-blocking primitive, not the page's manual `getUser`), returns
  `{ groupId, email }` for Stripe, and redirects on a different trigger. Folding
  it into the page helper would merge two different auth postures and return
  shapes for no gain — the drift that mattered was the four **page** copies, and
  that's closed. Noted in the audit so the next reader doesn't "finish the job"
  by collapsing a helper that's correctly distinct.
- **`nextPath: string`, not `Route`.** Typing the param `Route` rejected the
  callers' templated `` `/groups/${string}/edit` `` — typedRoutes won't match a
  dynamic-segment hole to the route param in **argument** position (it's fine in
  `redirect`/`Link` href position). Typed it `string` and cast once inside, at
  the `/login?next=…` redirect.

## Changes

- New [require-group-manager.ts](../../apps/web/src/app/groups/[id]/_lib/require-group-manager.ts).
- [edit/page.tsx](../../apps/web/src/app/groups/[id]/edit/page.tsx),
  [members/page.tsx](../../apps/web/src/app/groups/[id]/members/page.tsx),
  [billing/page.tsx](../../apps/web/src/app/groups/[id]/billing/page.tsx),
  [analytics/page.tsx](../../apps/web/src/app/groups/[id]/analytics/page.tsx) —
  each replaced its gate block with the helper and dropped the now-unused
  imports (`getServerSupabase` / `SupabaseGroupQueryRepository` / `notFound` /
  `redirect` as applicable).

Verified `pnpm typecheck && lint && test && build` (all green; touched files add
zero lint warnings).

## Follow-ups

Remaining open in the audit: GD-4 (join-request product call), GD-6
(member-form field vocab → `fieldInputClass` / `field()`), GD-8 (host-page h1
size), GD-10 (member-row mobile `flex-wrap`).
