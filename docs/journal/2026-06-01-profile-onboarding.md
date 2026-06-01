# Profile hub first-run "Get started" card (PR-3) (2026-06-01)

## Context

Closes **PR-3** in [profile-page-ux.md](../audits/profile-page-ux.md). A
brand-new user landed on a hub of empty sections (no events, no groups, no
videos, no following) — each with its own empty state, but with no top-level
"what do I do here" guidance and no profile-completeness signal. The first
impression of one's own hub was a wall of nothing.

## Decisions

- **AND of "sparse profile" + "zero activity," not OR.** The card shows only
  when `(!home_city && positions.length === 0 && !avatar_url)` **and** there's no
  attending/hosted event, follow, group, or video. This makes it a true
  first-run welcome that disappears the instant the user fills any profile field
  _or_ takes any first action — chosen over a persistent completion checklist,
  which would nag established users and fight the "lightweight" ask in the
  finding.
- **Deep-link the Edit disclosure open via a URL param, not client state.** The
  "Complete your profile" step links to `?edit=1#edit-profile`; the Edit
  `<details>` renders `open={editOpen}` and gained `id="edit-profile"` so the
  anchor scrolls to it. Native `<details>` stays user-toggleable afterwards (the
  server only sets the initial `open` attribute), so this needs **zero client
  JS** and keeps the page a server component. Chose this over lifting the
  disclosure into a `'use client'` component with state — the param is simpler,
  shareable, and back/forward-friendly.
- **A 3-step list, not just the two CTAs the finding named.** Added "Follow some
  players" (`/players`) alongside "Complete your profile" + "Find your first
  event" — following is the third thing that makes the hub come alive (it
  populates the Following feed + the home/listing Following tab). Kept it to
  three so the card stays a glance, not a chore.
- **Numbered link-rows reusing the pending-invite row chassis.** Same
  `border-border-base bg-surface hover:border-primary/40 … rounded-md border p-3`
  row used by the pending-invites and group lists, with a small numbered badge —
  no new visual vocabulary. The card itself uses a `border-primary/30 bg-primary/5`
  tint to read as a friendly callout, distinct from the neutral content cards.
- **Placed above Quick actions.** It's the first block after the identity hero,
  so a new user sees it before the (now player-first) quick actions and the
  empty content sections. The slight overlap with the "Find events" quick-action
  tile is acceptable reinforcement for a first-run user; the card adds the
  profile + follow steps the tiles don't frame as onboarding.

## Changes

- [profile/page.tsx](../../apps/web/src/app/profile/page.tsx) — parse
  `editOpen` from `?edit`; derive `profileIncomplete` / `hasNoActivity` /
  `showOnboarding`; render the "Welcome to PickupVB" card (new `GetStartedStep`
  helper); add `id="edit-profile"` + `open={editOpen}` to the Edit `<details>`.

## Patterns observed

- **A URL param + native `<details open>` is the cheapest "deep-link a
  disclosure open" primitive.** No client component, no state, back/forward
  works, and the element stays user-toggleable because the server only sets the
  initial attribute. Worth reaching for before lifting a disclosure to
  `'use client'` just to control its open state (cf. the RSC-can't-pass-functions
  pitfall — staying server-side sidesteps it entirely).

## Follow-ups

Remaining profile-hub items, all in
[profile-page-ux.md](../audits/profile-page-ux.md):

- **PR-4 (P3)** — "Edit profile" collapsed while the Avatar/Hero editors sprawl
  open; co-locate under one disclosure. (Now that PR-3 deep-links the Edit
  `<details>`, PR-4 should keep `id="edit-profile"` pointing at the combined
  section.)
- **PR-5 (P3)** — the primary "Find events" tile still uses `hover:opacity-90`
  instead of the M3 state-layer.
- **PR-6** — anon users see the full host/payout hub; tracked by persona-ux
  **V-4**.
