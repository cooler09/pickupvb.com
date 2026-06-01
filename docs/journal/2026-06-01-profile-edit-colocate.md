# Profile hub: co-locate the identity editors (PR-4) (2026-06-01)

## Context

Closes **PR-4** in [profile-page-ux.md](../audits/profile-page-ux.md). The
"edit my identity" affordances were split: name / city / positions / socials hid
behind a collapsed "Edit profile" `<details>`, while the `AvatarPanel` and
`HeroImagePanel` rendered **fully expanded** as standalone cards right below it.
So the form was one click away but the photo editors were always open, and the
two always-open cards pushed the Privacy section far down the page.

## Decisions

- **Move the photo panels inside the existing disclosure, not the reverse.** The
  finding offered two shapes — one disclosure, or a single always-open "Profile &
  photos" card. Chose the disclosure: the hub's value is being scannable, and
  collapsing the (rarely-touched) editors keeps Privacy and the content sections
  reachable without a long scroll. Putting the photo panels inside the
  `<details>` content (after `ProfileForm`, `space-y-6`) co-locates all three
  with the least churn.
- **Keep the panels' own bordered sub-cards.** `AvatarPanel`/`HeroImagePanel`
  each own a `border … p-5` card with an `<h2>`. Nesting them inside the
  disclosure body yields a card → sub-cards layout, which actually _helps_ —
  the bordered sub-cards visually separate the two image uploaders from the
  form fields. Didn't strip their wrappers (they're shared client components
  used elsewhere; local restyling would fork them).
- **Preserve the PR-3 deep-link contract.** The onboarding card's "Complete
  your profile" step links to `?edit=1#edit-profile`; now that the photo editors
  live inside that same `<details id="edit-profile" open={editOpen}>`, the
  deep-link reveals them too — a free win from the co-location. Updated the
  summary hint to "Name, city, positions, photos, socials…".

## Changes

- [profile/page.tsx](../../apps/web/src/app/profile/page.tsx) — moved
  `<AvatarPanel>` + `<HeroImagePanel>` from standalone siblings into the
  "Edit profile" `<details>` content (after `ProfileForm`); content `<div>`
  gained `space-y-6`; summary hint mentions photos.

## Patterns observed

- **Disclosure deep-link + co-location compound.** PR-3 made the Edit
  `<details>` openable by URL; PR-4 then put more inside it — so one cheap
  primitive (`?edit=1` → native `open`) now reveals the entire identity-edit
  surface. When a disclosure is the canonical home for a task, pulling stray
  always-open editors into it is usually the right consolidation (fewer
  top-level cards, one deep-link target).

## Follow-ups

Remaining profile-hub items, both in
[profile-page-ux.md](../audits/profile-page-ux.md):

- **PR-5 (P3)** — the primary "Find events" quick-action tile uses
  `hover:opacity-90` instead of the M3 state-layer every `primaryButtonClass`
  surface uses.
- **PR-6** — anon users see the full host/payout hub; tracked by persona-ux
  **V-4**.
