# Relative event-date labels (F-10) (2026-06-01)

## Context

Closes **F-10** in [find-events-ux.md](../audits/find-events-ux.md). Event cards
showed only an absolute date (`Sat, Jun 14, 6:00 PM`), but players scanning a
discovery feed think in "tonight / tomorrow / this weekend". Cards now lead with
a relative day label for near-term events.

## Decisions

- **Per-card labels, not day-group section headers.** The audit floated both.
  Group headers ("Today", "This weekend") would span the in-memory pagination
  slice awkwardly (a group split across pages, or a page that's all one group
  with no header context). A per-card label is local, composes with the existing
  card, and is pagination-agnostic.
- **Compute on the server, pass as a prop — keep the card pure.** Relative-to-now
  needs "now", and the card renders through `LocalDateTime` (a client component).
  Calling `Date.now()`/`new Date()` in render trips the React Compiler purity
  rule (AGENTS.md pitfall #4). The page already has a request `now`, so
  `relativeEventDay(startsAt, timeZone, now)` runs at the page boundary and the
  result is a plain string prop — no client "now", no hydration dance. The page
  is dynamic (cookies + searchParams), so `now` is fresh per request.
- **Anchor "today" to the event's own timezone, not the viewer's or UTC.**
  "Today" means _the event is today where it's held_ — computed by comparing the
  event's venue-tz calendar day to `now`'s venue-tz calendar day. For events near
  the viewer (the common case) venue tz ≈ viewer tz, so it reads naturally; for
  browsing another city it correctly means "today there". UTC day boundaries
  would mislabel evening events (e.g. a 9pm ET event reading "Tomorrow").
- **Buckets: 0 → Today, 1 → Tomorrow, 2–6 → short weekday, else null.** Beyond a
  week (and for past events, where the diff is ≤ 0) there's no relative win, so
  the card keeps the absolute date. When a label is shown, the date collapses to
  the time only (`Today · 6:30 PM PST`) to avoid "Today · Sat, Jun 14" redundancy.

## Changes

- [date-formats.ts](../../apps/web/src/lib/date-formats.ts) — pure
  `relativeEventDay` + a private `dayOrdinal` (tz-aware calendar-day ordinal via
  `Intl…formatToParts`).
- [date-formats.test.ts](../../apps/web/src/lib/date-formats.test.ts) — **new**;
  pins Today/Tomorrow/weekday/null buckets and the event-timezone anchoring
  (a `…T01:00Z` instant that's still "today" in ET).
- [event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx) —
  `relativeDay` prop; renders `<b>{relativeDay}</b> · <time>` when present, else
  the absolute `eventStart`.
- [page.tsx](../../apps/web/src/app/events/page.tsx) — populate `relativeDay`
  from `relativeEventDay(..., now)` in both the search and Following mappings.

## Follow-ups

- Find-events backlog: **F-11** (collapse the filter card behind a single
  trigger — the one layout change worth a design check first) and **F-13** (card
  thumbnails — needs `hero_image_url` through the search RPC; `events_view`
  already exposes it). Both P3. Tracked in
  [find-events-ux.md](../audits/find-events-ux.md).
