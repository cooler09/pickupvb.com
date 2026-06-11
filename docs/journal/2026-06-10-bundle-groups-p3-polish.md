# Groups P3 polish — GD-6 / GD-8 / GD-10 (2026-06-10)

## Context

Closes the remaining quick P3s from the groups detail-surface pass
([groups-page-ux.md](../audits/groups-page-ux.md)), after the
[member-feedback](2026-06-10-bundle-groups-detail-ux.md) and
[gate-dedup](2026-06-10-bundle-group-manager-gate.md) bundles. Only **GD-4**
(join-request product call) stays open. All three here are convention/visual
drift, not behaviour.

## Decisions

- **GD-6 — field vocab, no local const.** The add-member role `<select>` and its
  label hand-rolled class strings; switched to `fieldLabelClass` +
  `` `${fieldInputClass} sm:w-48` ``. The shared chassis already carries
  `w-full`, and `sm:w-48` overrides it at the breakpoint to keep the desktop
  constrained width. The `addMemberFromForm` wrapper moved off raw
  `formData.get(...)` to the `field()` helper — robust to the `useFormState`
  slot-prefix quirk even though this is a plain `<form action>` today. (Used the
  shared constants directly rather than re-declaring a local `const selectClass`,
  which the pattern-11 `no-restricted-syntax` ratchet forbids anyway.)
- **GD-8 — align _down_ to `text-headline-sm`, against pattern 16's letter.**
  AGENTS pattern 16 nominally maps a page-title h1 → `text-headline-lg`, but the
  app is ~50/50 on page-title size in practice (33 `page.tsx` use `headline-lg`,
  34 use `headline-sm`) — there's no hard convention to honour. Within the groups
  feature the split was lopsided: only billing + analytics used `headline-lg`;
  the directory, the detail **group-name** h1, edit, members, and new all use
  `headline-sm`. So feature-internal consistency won — bump the two outliers down
  rather than five pages up, and keep the group-name (the feature's primary
  title) as the size anchor. Both are valid M3 roles, so neither triggers the
  type-scale ratchet.
- **GD-10 — `grow basis-full sm:basis-auto`, not `flex-1`.** Adding `flex-wrap`
  to the row plus `basis-full` on the name forces the name onto its own line on
  mobile (the up-to-four role/remove buttons wrap below instead of overflowing a
  ~360 px viewport); `sm:basis-auto` restores the inline single-row layout. Kept
  `grow` rather than the original `flex-1` because `flex-1` sets `flex-basis:0%`,
  which collides with `basis-full` (two utilities targeting `flex-basis`, and
  Tailwind's source order — not class-attribute order — decides the winner, so
  the result would be brittle). `grow` (flex-grow only) + an explicit `basis-*`
  is unambiguous.

## Changes

- [add-member-form.tsx](../../apps/web/src/app/groups/[id]/members/_components/add-member-form.tsx)
  - [members-actions.ts](../../apps/web/src/app/groups/[id]/members/members-actions.ts) (GD-6).
- [billing/page.tsx](../../apps/web/src/app/groups/[id]/billing/page.tsx)
  - [analytics/page.tsx](../../apps/web/src/app/groups/[id]/analytics/page.tsx) — h1 → `text-headline-sm` (GD-8).
- [member-row-item.tsx](../../apps/web/src/app/groups/[id]/members/_components/member-row-item.tsx) — `flex-wrap` + name basis (GD-10).

Verified `pnpm typecheck && lint && test && build` (all green; touched files add
zero lint warnings).

## Follow-ups

- **GD-4** is the only open groups-UX finding — a product call: clarifying copy
  near the follow button (following ≠ membership) vs. a real
  `group_join_requests` flow with an owner/admin inbox. Recommend the copy first;
  build the request flow only if self-serve club growth becomes a goal.
