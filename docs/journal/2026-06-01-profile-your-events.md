# Profile hub "Your events" / attending feed (PR-1) (2026-06-01)

## Context

Closes **PR-1** in [profile-page-ux.md](../audits/profile-page-ux.md), the
headline finding from the profile-hub UX audit created the same day. The hub
surfaced events the user **hosts** but had no section for events they'd **RSVP'd
to** — and that was answerable nowhere: no "my events" nav destination, no
attending-events query in the app layer, and the Following feed is "events from
people you follow," not "events I joined." For the player/attendee persona whose
hub this is, "what's my next game" had no home.

## Decisions

- **Proper hexagonal increment, not a web-layer loader.** The sibling Hosting
  section uses a web-layer `loadVisibleHostedEvents` + a bespoke `HostedEventsList`
  card. PR-1 instead goes through the layers — `GetAttendingEventsQuery` →
  `EventReadModels.listAttending` port → `SupabaseEventRepository.listAttending`
  — returning the rich `VolleyballEventSummary` so the section renders with the
  **shared `EventCard`** and inherits the H-1 card wins (price chip, capacity/
  `Full` badge, relative date, hero thumbnail) for free. Chose this over cloning
  the simpler hosted card because the player's own events deserve the best card,
  and the read belongs in the CQRS read side, not the page.
- **Hydrate in JS from `events_view` + `event_divisions` — don't touch
  `search_events`.** The RPC that powers `search` takes filter args, not an id
  list, and the team's established preference (F-13 journal) is to avoid
  altering that large function. So `listAttending` mirrors `searchFollowingFeed`:
  read the viewer's `event_participants` rows, resolve event ids through the
  division join, then batch-hydrate scalar/series/fundraiser fields +
  `attendee_count` + hero from `events_view` and the full divisions (prices,
  skill, capacity) from `event_divisions`. Migration-free.
- **`event_participants`, not `event_attendees`.** The audit cited
  `event_attendees`, but that table was collapsed into `event_participants`
  (migrations `20260802`/`20260808`); participation is keyed by `division_id`,
  so the event id comes through an `event_divisions!inner(event_id)` join — the
  same shape `searchFollowingFeed` already uses. Audit text corrected.
- **`startsAfter` passed from the page boundary.** The query carries the cutoff
  date (the page's `now`) rather than the repo calling `new Date()`, keeping the
  read side clock-free and consistent with the page-boundary `relativeEventDay`
  pattern (no impure reads in render / repos).
- **Admin-client read is authorized by the `user_id` filter, not RLS.** The
  static `SupabaseEventRepository` runs on the admin client; scoping
  `event_participants` to `user_id = viewer` is the authorization (a user seeing
  their own attended events), so no RLS is relied on — consistent with AGENTS.md
  pattern #8 and with how `search`/`searchFollowingFeed` already read.
- **Section placed above Hosting (player-first).** Minimal nod to PR-2's
  reorder argument without doing the full quick-actions rebalance. Empty state
  links to `/events`. Paginated with an `apage` param mirroring Hosting's
  `hpage` (AGENTS.md pattern #12).
- **Failed read degrades to empty.** The page wraps the handler call in
  `.catch(() => [])` so a hiccup loading attended events shows the empty state
  rather than taking down the whole hub (the section is additive, not critical).

## Changes

- [event-repository.ts](../../packages/domain/src/events/event-repository.ts) —
  `listAttending` added to the `EventReadModels` port.
- [messages.ts](../../packages/application/src/messages.ts) /
  [event-queries.handler.ts](../../packages/application/src/queries/event-queries.handler.ts)
  — `GetAttendingEventsQuery` + `GetAttendingEventsHandler` (delegates to the
  port; spreads `limit` only when set, per `exactOptionalPropertyTypes`).
- [get-attending-events.handler.test.ts](../../packages/application/src/queries/get-attending-events.handler.test.ts)
  — handler unit test: delegation args + the limit-omission contract.
- [event-detail.handler.test.ts](../../packages/application/src/queries/event-detail.handler.test.ts)
  — existing `EventReadModels` fake gained `listAttending` (port grew).
- [supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts)
  — `listAttending` implementation; `EventSearchDivision` added to imports.
- [handlers.ts](../../apps/web/src/lib/handlers.ts) — wired
  `getAttendingEvents`.
- [profile/page.tsx](../../apps/web/src/app/profile/page.tsx) — "Your events"
  section (shared `EventCard` + `Pagination` `apage`), `VolleyballEventSummary`
  → `EventCardData` mapping, shared `now`.

## Patterns observed

- **Growing a port interface breaks only the structurally-typed fakes.** Adding
  `listAttending` to `EventReadModels` broke the two test fakes typed directly as
  `EventReadModels` (had to add the method), but not the dozens of
  `as unknown as EventRepository` double-cast fakes — those bypass the structural
  check. When extending a port, grep for direct `: EventReadModels` /
  `: EventRepository` annotations, not just the type name.
- **`searchFollowingFeed` is now the de-facto template for "events for a user,
  rich card, no RPC."** Third consumer of the `events_view` + `event_divisions`
  JS-hydration shape (search-by-id hero merge, Following feed, now attending).
  If a fourth lands, this is worth extracting into a shared hydrator.

## Follow-ups

Remaining profile-hub items, all in
[profile-page-ux.md](../audits/profile-page-ux.md):

- **PR-2 (P3)** — host-weighted quick actions + section order; make host/payout
  tiles adaptive and reorder player-first. A dedicated "My events" nav
  destination (deferred from PR-1) lives here.
- **PR-3 (P3)** — no first-run onboarding on an empty hub.
- **PR-4 (P3)** — "Edit profile" collapsed while the Avatar/Hero editors sprawl
  open; co-locate under one disclosure.
- **PR-5 (P3)** — primary "Host an event" tile uses `hover:opacity-90` instead
  of the M3 state-layer.
- **PR-6** — anon users see the full host/payout hub; tracked by persona-ux
  **V-4**.
- **Team-based attendance** is out of scope for v1: `listAttending` reads
  individual `role = 'attendee'` rows, so a player who's in an event only via a
  team roster won't see it under "Your events" yet. Revisit if the player
  persona needs it.
