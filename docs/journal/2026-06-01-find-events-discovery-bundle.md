# Find-events discovery UX bundle (2026-06-01)

## Context

User asked to re-evaluate the **find-events (discovery/listing) page**
(`/events`) through the persona lens and make it easier to use. The existing
[events-page-ux.md](../audits/events-page-ux.md) audit is scoped to the event
**detail** page (`/events/[id]`), so the listing page had never had its own
UX pass. A read of the page + the search projection surfaced that the
`search_events` RPC already returns `priceCents`/`priceUnit` per division,
`spotsRemaining`, `distanceKm`, and `isFundraiser` — so most of the
highest-value card improvements needed **zero new query work**, just rendering
data already in hand.

This is the "first bundle" from that re-evaluation: the high-leverage card
quality items + auto-apply filters + the one correctness gap (pagination).
Persona weighting: **player/attendee** discovery first.

## Decisions

- **Render price from the divisions already on the card, don't add a query.**
  `priceLabel(divisions)` computes Free / `$10` / `$10/team` / `From $X` from
  `priceCents`/`priceUnit`. Chose a local helper in `event-card.tsx` over
  extending `lib/money.ts` (which is a parser module, not a formatter) to keep
  the blast radius to one file.
- **Whole-card tap via stretched link, not an outer `<Link>` wrapper.** The
  card has no other interactive children, so `relative` on the `<li>` +
  `after:absolute after:inset-0` on the title link makes the whole tile
  clickable while keeping a single focusable element; `focus-within:ring` then
  rings the entire card on keyboard focus. Avoids nesting interactive elements.
- **Capacity badge is card-only this pass.** Promoted `spotsRemaining` to a
  colored chip (`Full` / `N left` amber ≤4 / `N spots`). It lights up on
  Upcoming/Past where the RPC populates it; the **Following feed stays null**
  because its repo query reads the base `events` table, not the capacity-aware
  RPC — populating it is a deeper infra change, deferred (see Follow-ups).
- **Auto-apply filters via `router.push` + `useTransition`, keeping
  `method="get"` + the Apply button as the no-JS fallback.** Mirrors the
  existing `NearMeButton` pattern (SPA nav + pending dim) rather than a native
  full-page GET. Rebuilding the query from `FormData` naturally drops `page`
  (resetting pagination) and preserves the hidden `when`/`lat`/`lng` fields.
- **Paginate in-memory over a raised fetch ceiling (120), not SQL
  `range()`.** The `search_events` RPC returns a flat list with no exact count,
  and the page already loads the full set; an in-memory slice with the shared
  `Pagination` matches AGENTS.md pattern #12 (slice the display, keep the full
  array for the count). `PAGE_SIZE = 12` fills the 3-col grid evenly. Beats the
  old hard cap of 30 that silently hid everything past the first screen.

## Changes

- [event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx) —
  added `formatPriceCents` + `priceLabel` helpers and a price chip; promoted
  `spotsRemaining` to a colored capacity badge (replacing the buried bottom
  "N spots open" line); made the whole tile tappable (stretched link +
  `focus-within` ring).
- [event-filter-form.tsx](../../apps/web/src/app/events/_components/event-filter-form.tsx)
  — converted to a client component; auto-applies filters on `change` via
  `router.push` + `useTransition` (form dims while pending); kept `method="get"`
  - Apply button as the no-JS fallback.
- [event-filter-options.ts](../../apps/web/src/app/events/_components/event-filter-options.ts)
  — **new** module holding the `SURFACES`/`TYPES`/… constant arrays + filter
  types, extracted out of the now-`'use client'` form so the server page can
  read the real arrays (see Patterns).
- [page.tsx](../../apps/web/src/app/events/page.tsx) — import the filter
  options from the new module; raised the search fetch limit 30 → 120; added
  in-memory pagination (`PAGE_SIZE`, clamped `page`, `pageEvents` slice,
  `<Pagination>`); subheader now leads with the result count.
- [active-filter-chips.tsx](../../apps/web/src/app/events/_components/active-filter-chips.tsx)
  — re-pointed its type imports at `event-filter-options`.

## Patterns observed

- **Adding `'use client'` to a module that also exports plain constants used by
  a server component silently breaks them.** `event-filter-form.tsx` exported
  the `SURFACES`/`TYPES`/… arrays that the server `page.tsx` `pick()` calls
  `.includes()` on. Once the module is `'use client'`, a server import of those
  constants resolves to a client-reference proxy, not the array — caught here
  by reasoning, not by typecheck/build (which stay green). Fix: keep shared
  data/types in a plain module and import into both sides. Worth keeping in
  mind alongside the existing "Functions cannot be passed to Client Components"
  pitfall in AGENTS.md.

## Follow-ups

- **Capacity on the Following feed** — `searchFollowingFeed`
  ([supabase-social-graph-repository.ts](../../packages/infrastructure/src/supabase-social-graph-repository.ts))
  selects from base `events`, which has no computed `spots_remaining`; wiring it
  through the capacity-aware view/RPC (and adding `spotsRemaining` +
  `priceCents` to `FollowingFeedItem`) is the deeper change. Deferred to keep
  this bundle near-zero-risk.
- **Remaining find-events findings** from the re-evaluation not in this bundle:
  price filter ("Free only"), manual city/ZIP location entry (GPS-or-nothing
  today), sort control, relative date grouping, hero-image thumbnails on cards
  (needs `image_url` in the search RPC), and design-system polish on
  `near-me-button` / `event-timeframe-tabs`. These should be written up into a
  dedicated find-events section/file under [docs/audits/](../audits/) with
  P1/P2/P3 grades — not yet done.
