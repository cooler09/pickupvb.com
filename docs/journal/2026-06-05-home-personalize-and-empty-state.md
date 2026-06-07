# Homepage near-me copy (H-2), empty-peek fallback (H-3), signed-in personalization (H-6) (2026-06-05)

## Context

Closes the last three open findings in
[home-page-ux.md](../audits/home-page-ux.md), clearing the audit (H-1…H-9 all
resolved; H-5 lived with persona-ux V-4):

- **H-2** — the hero's primary CTA read "Find events **near me**" but linked to
  bare `/events` with no location, and the peek itself is fetched with no `near`.
  The button promised proximity the page never delivered.
- **H-3** — the entire "Upcoming events" section was gated on
  `upcomingEvents.length > 0`, so in a brand-new metro the single most valuable
  above-the-fold proof just vanished, leaving marketing copy and no events.
- **H-6** — a returning signed-in player saw the visitor's generic marketing
  page (only the guest sign-in nudges were hidden). No "your next event" surface.

## Decisions

- **H-2 — re-copy, don't build geolocation (option a).** Changed the CTA to
  "Find events". Option (b) (a real `?near=prompt` round-trip that auto-triggers
  the browser geolocation prompt on `/events`) was rejected as disproportionate
  for a P3 honesty nit — the homepage isn't claiming to be a near-me entry point
  anywhere else. The peek heading was already proximity-neutral, so it stayed.
- **H-6 — "Your upcoming events" peek (the chosen product direction).** For
  signed-in users the page now leads with their RSVP'd upcoming events via
  `handlers.getAttendingEvents` (`GetAttendingEventsQuery(user.id, now, 3)`),
  rendered with the shared `EventCard` and a "See all →" link to `/profile`
  (where the profile hub's "Your events" lives). Key choices:
  - **Viewer-scoped, so deliberately _outside_ the H-9 `loadHomePeek` cache.**
    The cached peek is keyed globally for all anon visitors; per-user RSVPs can't
    share that key. This read runs only when `user` is present (the page is
    already dynamic for authed users), and degrades to `[]` on failure.
  - **Hidden when empty.** A player with no RSVPs falls back to the generic
    marketing page rather than seeing an empty "Your upcoming events" rail.
  - Rejected the lighter "minimal CTA only" and the heavier "Following feed"
    options — the RSVP'd-events peek is the most directly useful and is a single
    viewer-scoped query with no friend-graph dependency.
- **H-3 — always render the section, fall back to the shared `EmptyState`.** The
  "Upcoming events" `<section>` is now unconditional; an empty peek renders the
  canonical [`EmptyState`](../../apps/web/src/components/empty-state.tsx) ("No
  upcoming events yet — be the first to host one…") with the host CTA (anon users
  route to `/login?next=/events/new`). Used the existing primitive rather than a
  bespoke card so it matches every other empty list on the site. A single primary
  CTA (per the component's "empty state as a teacher" doc) — no secondary
  "browse" link, which would just dead-end on the equally-empty `/events`.
- **DRY the card mapping with a local `toEventCardData(e, now)` helper.** H-6
  needed the same summary→`EventCardData` mapping the public peek already did
  inline (18 fields). Rather than copy-paste it a second time in the same file,
  extracted one local pure helper that both peeks call. `VolleyballEventSummary`
  is re-exported from `@pickupvb/domain` (`events/index.ts`), so the param type
  imports cleanly. This is a local helper for its two same-file consumers (AGENTS
  "extract pure helpers into the file of their primary consumer"), not a new
  shared util.

## Verification

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all green (only the
pre-existing `set-state-in-effect` warnings in unrelated files). No new test: H-2
is copy, H-3 is a render-branch over an existing read, and H-6 is a viewer-scoped
read reusing the already-covered `getAttendingEvents` handler with the standard
`EventCard` mapping — no new domain rule or branching logic to pin.

## Files

- [apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx) — hero CTA copy
  (H-2); always-rendered "Upcoming events" section with `EmptyState` fallback
  (H-3); "Your upcoming events" peek + `myEvents` read (H-6); shared
  `toEventCardData` helper feeding both peeks.

## Follow-ups

- The home-page-ux audit is now **fully cleared** — no open backlog.
- The real managed-**waitlist** queue (H-7 option b) remains the separate
  **Hannah** initiative, untouched here.
