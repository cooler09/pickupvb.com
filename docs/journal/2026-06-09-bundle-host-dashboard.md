# Host dashboard at `/host` (2026-06-09)

## Context

Hosts are among the most valuable users on PickupVB, but their tooling was
scattered: per-event management at `/events/[id]/manage`, a Pro-gated, table-only
"Host analytics" view buried under `/profile/billing/analytics` (which only
covered `host_id` events, _missing co-hosted ones_), and a flat "Hosting" list on
the profile hub with no insight or action layer. There was no single home a host
lands on to see how their events are doing and act on them.

This builds a first-class **host home at `/host`** that aggregates across _all_
events the viewer hosts (primary + co-host), shows real no-dependency charts,
surfaces a "needs attention" action layer, and links into per-event management.
The home is **free to every host**; the existing deep-revenue analytics stays
**Pro-gated** (linked from a teaser card, not rebuilt).

User decisions locked before building (via plan-mode question): new top-level
`/host` (not an in-place upgrade of the billing analytics page); hand-rolled
charts (no charting library — matches the repo's existing no-dep convention);
free action-focused home with Pro-gated deep analytics; focused MVP first.

## Decisions

- **Reused `loadVisibleHostedEvents`
  ([hosted-events-list.tsx](../../apps/web/src/components/hosted-events-list.tsx#L84))
  as the event source** rather than a new query. It already returns events hosted
  as primary _or_ co-host and hydrates `capacity_kind` / `max_spots` /
  `attendee_count` from the primary division — so fill rate, "full" detection, and
  the signups chart all come free off the rows with **no extra per-event query**.
  This also fixes the old analytics page's blind spot (co-hosted events were
  invisible there).
- **Revenue is scoped to the viewer's own `host_id` events**, not the full
  primary+co-host set — co-hosted event money pays out to the _primary_ host
  (pattern #7), so counting it on a co-host's dashboard would be wrong. One cheap
  `events_view.select('id').eq('host_id', user.id)` gets the own-event ids; the
  `event_payment_audit` reads (all-time narrow headline + 12-month windowed
  detail) mirror the existing analytics page's shape.
- **All aggregation/classification is a pure module
  ([`_loaders/aggregate.ts`](../../apps/web/src/app/host/_loaders/aggregate.ts))**,
  Supabase-free and unit-tested in isolation
  ([aggregate.test.ts](../../apps/web/src/app/host/_loaders/aggregate.test.ts),
  13 cases). Any "now" is passed in as `nowMs` rather than read from the clock —
  keeps the helpers deterministic for tests and honors React Compiler rule #4
  (no impure reads). `needsAttention` classifies one item per event in priority
  order: upcoming **draft** (publish it) > **full** fixed-capacity (review the
  waitlist) > **starting_soon** within 7 days.
- **New reusable `BarChart` primitive
  ([components/charts/bar-chart.tsx](../../apps/web/src/components/charts/bar-chart.tsx))**
  — a pure server component built from CSS-height bars (not `<svg>`, to dodge
  text-scaling/label-legibility pitfalls), themed entirely with M3 role tokens
  (`bg-primary` positive, `bg-md-error` negative), with a real zero baseline so a
  refund-heavy revenue month renders correctly. Generic over `{ label, value }[]`
  so the next small categorical chart (e.g. club analytics) can reuse it instead
  of hand-rolling another table.
- **Two charts, both no-extra-query:** net revenue by month (windowed audit) and
  signups by month (`attendee_count` bucketed by event `starts_at` across a
  past→future window, so **upcoming** demand shows — a host wants to see the next
  two months filling, not just history).
- **Deep analytics stays where it lives.** The Pro-gated
  `/profile/billing/analytics` page is linked from a teaser card on `/host`
  (Pro → "View full analytics"; non-Pro → "Upgrade to Pro") rather than rebuilt
  or moved. Relocating it to `/host/analytics` is a deferred follow-up.

## Entry points

- Added **Dashboard** as the first item in the "Host" nav dropdown
  ([site-header.tsx](../../apps/web/src/components/site-header.tsx#L135)).
- Added a host-only **Host dashboard** quick-action tile on the profile hub
  ([profile-hub-sections.tsx](../../apps/web/src/app/profile/_components/profile-hub-sections.tsx))
  — shown only when `isHost`, without displacing the existing "+ New event"
  affordance.

## Verification

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green (369 web tests,
incl. the 13 new aggregate cases). `/host` builds as a dynamic route (it reads
cookies via `getServerSupabase`; no `force-dynamic` needed — not a public page).
Adding the new route required a one-off `next typegen` so `/host` entered the
`typedRoutes` union before `tsc --noEmit` (typecheck runs before build in the
verify chain). **Not yet visually verified in a running app** — manual dev-server
check still owed: stat cards, both charts in light + dark, needs-attention links,
per-row Manage links, the non-Pro vs Pro analytics card, and the signed-in
non-host empty CTA state.

## Follow-ups (deferred, MVP scope)

- Attendee-retention / repeat-attendee cohorts, per-event drilldowns, payout
  reconciliation, CSV exports, message/attendee insights.
- Relocate the Pro deep-analytics from `/profile/billing/analytics` to
  `/host/analytics`.
- Interactive chart tooltips (would need a small `'use client'` wrapper around
  `BarChart`).
