# Groups detail-surface UX bundle — GD-1/2/3/7/9 (2026-06-10)

## Context

Re-audited the **whole** groups surface, not just the directory: the 2026-06-01
pass ([groups-page-ux.md](../audits/groups-page-ux.md), G-1…G-5) had explicitly
scoped out `/groups/[id]` (detail, members, edit, billing, analytics) as "its
own audit if/when we get there." This bundle widens that file's scope and ships
the high-leverage, low-risk subset of the new findings (GD-1, GD-2, GD-3, GD-7,
GD-9). The remaining five (GD-4 join-request product call, GD-5
`requireGroupManager` dedup ×4, GD-6 member-form field vocab, GD-8 host-page h1
size, GD-10 member-row mobile wrap) stay open in the audit.

The through-line of the fixed set: a manager acting on a group used to get **no
feedback** on a failed guard and **lost context** when moving between surfaces.

## Decisions

- **GD-1 — flash-param redirect, not silent swallow, and not a `Result`.** The
  member ops (`addGroupMember` / `removeGroupMember` / `changeGroupMemberRole`)
  run from plain `<form action={…}>` submissions, so per the AGENTS
  "Server-action error handling" split the correct primitive is a **flash-param
  redirect**, not a typed `Result` (there's no client state to branch on). The
  pre-ADR-0021 code swallowed every `DomainError` to mimic the old RLS no-op;
  that's safe but a confusing dead-end — the single most common trigger is
  removing/demoting the **last owner** of a one-owner club, which just did
  nothing. `runMemberOp` now maps the expected errors to a reason
  (`memberFlashReason`) and `redirect(\`${returnPath}?member=<reason>\`)`; the
members page renders a `MEMBER_FLASH` `<Alert>`. `InvariantViolation`maps to a
specific`last_owner`message because the Group aggregate's only invariant on
this path is the last-owner guard — verified in`group.ts` before collapsing
it to one code. Unexpected non-`DomainError`s still bubble. Server-rendered
flash (read from `searchParams`after the redirect), so **no`useAlertReveal`\*\*
  — that hook is for client-state forms (AGENTS pattern 15 says skip it here).
- **GD-3 — merge `hostGroupId` into the prefill, don't add a new form prop.**
  The create-event form's `BasicsSection` already reads
  `defaultValue={val(values, 'hostGroupId', '')}`, so the cheapest preselect is
  to inject `{ hostGroupId }` into the `templateValues`/prefill record the page
  already threads in — no new prop, no form change. The `?host_group=<slug>`
  param is resolved against `manageableGroups` (which carries `slug`; the
  `hostableGroups` projection drops it) and **membership-gated** there — an
  unmanaged or bogus slug yields no preselect rather than leaking a group into
  the dropdown. It's additive over a `?from=`/`?template=` prefill (a host won't
  realistically have both, but the merge is harmless if they do).
- **GD-7 — `neutralButtonClass`, matching the detail page.** The directory's
  "✓ Following" used the primary-tinted `secondaryButtonClass`; AGENTS pattern 11
  is explicit that the neutral-bordered "Following" look is `neutralButtonClass`.
  The detail page was already correct, so this is pure convergence.
- **Typed-routes cast.** `redirect(\`${returnPath}?member=…\` as Route)`mirrors
the existing cast in the group billing actions —`returnPath`is a plain`string`, so the template literal isn't a statically-known route.

## Changes

- [member-actions.ts](../../apps/web/src/app/groups/member-actions.ts) —
  `memberFlashReason` + redirect-on-`DomainError` in `runMemberOp`.
- [members/page.tsx](../../apps/web/src/app/groups/[id]/members/page.tsx) —
  `MEMBER_FLASH` map + `<Alert>` from `?member=`.
- [groups/page.tsx](../../apps/web/src/app/groups/page.tsx) — "Group deleted."
  success `<Alert>` from `?deleted=1` (GD-2).
- [events/new/page.tsx](../../apps/web/src/app/events/new/page.tsx) — resolve
  `?host_group=<slug>` → `hostGroupId` prefill (GD-3).
- [group-viewer-actions.tsx](../../apps/web/src/app/groups/[id]/_components/group-viewer-actions.tsx)
  — "Host an event" → `/events/new?host_group=${slug}`.
- [groups-follow.tsx](../../apps/web/src/app/groups/_components/groups-follow.tsx)
  — followed state → `neutralButtonClass` (GD-7).
- [delete-group-panel.tsx](../../apps/web/src/app/groups/[id]/edit/delete-group-panel.tsx)
  - [delete-actions.ts](../../apps/web/src/app/groups/[id]/edit/delete-actions.ts)
    — drop dead `ok` state field (GD-9).

Verified `pnpm typecheck && lint && test && build` (all green; touched files add
zero lint warnings; 375 web tests pass).

## Follow-ups

- **GD-5** is the natural next pick: one `requireGroupManager(slug)` page helper
  to collapse the four copies of the slug→group + owner/admin gate (edit/members
  read-model, billing/analytics inline raw queries, billing-actions helper).
- **GD-4** needs a product call (clarify follow≠membership vs. build a real
  `group_join_requests` flow) before it's actionable.
