# League discovery filter on the events directory (2026-06-03)

## Context

Closes follow-up #2 from
[2026-06-03-bundle-league-public-signup.md](2026-06-03-bundle-league-public-signup.md).
The events directory already had a **Type** filter
([event-filter-options.ts](../../apps/web/src/app/events/_components/event-filter-options.ts)),
but its vocabulary was `['open_play', 'tournament']` — so a player couldn't
narrow `/events` to leagues even though published leagues already appear in
the unfiltered list.

## Decisions

- **One-line vocabulary addition, no plumbing.** Tracing the filter end to
  end showed every layer was already league-ready: the form renders
  `TYPES.map(t => TYPE_LABEL[t])` (`TYPE_LABEL.league` exists), the chips use
  `TYPE_LABEL[type] ?? type`, the page parser is `pick(get('type'), TYPES)`,
  the `search_events` RPC takes `p_type text` and filters
  `e.type::text = p_type` (so `'league'` is a valid passthrough — no enum or
  function change), and both `SearchEventsFilters.type` and
  `FollowingFeedFilters.type` are typed `EventType` (already includes
  `League`). So the whole feature is adding `'league'` to `TYPES`; everything
  else cascades. `EventCard` renders the badge via the same `TYPE_LABEL`
  lookup and is otherwise data-shape driven, so league cards render cleanly.
- **Metadata copy refreshed.** The `/events` description + OG description now
  name leagues alongside open play and tournaments.

## Changes

- `events/_components/event-filter-options.ts` — `TYPES` gains `'league'`.
- `events/page.tsx` — metadata description + OG copy mention leagues.

## Patterns observed

- **A shared vocabulary array + label map is the cheapest possible feature
  flag.** Because the form, chips, parser, and query filters all read the one
  `TYPES` const and the one `TYPE_LABEL` map, the filter was genuinely a
  one-line change — the inverse of the bug class where a literal is
  copy-pasted across N call sites. Worth preferring this shape for any new
  facet.

## Follow-ups

- **League timeframe semantics.** `/events` Upcoming uses `startsAfter: now`;
  a league's `starts_at` is its season start, so a mid-season league drops to
  the Past tab. Consistent with "signups close at start" (a started league
  isn't joinable), but a dedicated "ongoing leagues" affordance may be worth
  it later. Out of scope here.
- External (listing-only) leagues; season → playoff bracket handoff
  (audit P1 #2); schedule-page polish — all unchanged from the prior bundles.
  </content>
