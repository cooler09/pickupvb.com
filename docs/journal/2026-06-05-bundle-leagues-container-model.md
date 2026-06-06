# Leagues: finish the container model + season tracking (2026-06-05)

## Context

User asked to reevaluate whether leagues belong to `events`. A league is "teams
playing timeslots on a set schedule" (round-robin, then an optional end-season
playoff), and the ask was to "track for teams and hosts." We weighed three
models:

- **A — finish the container model:** league stays a `type='league'` event;
  divisions / registration / payments / playoff already key on `division_id`,
  not the event, so they're reused as-is. Add the missing tracking and stop the
  season from masquerading as a single gathering.
- **B — dedicated `League` aggregate** decoupled from events.
- **C — parent series of child-event sessions** (one event per match-night).

The user initially leaned B, then chose **A**. Background:
[docs/audits/event-data-model.md](../audits/event-data-model.md) (P1 #1/#2),
[ADR 0034](../adr/0034-league-play-on-entry-id.md) (league play keys on
`event_team_entries.id`; flagged "standings — none exist yet").

## Decisions

- **Chose A over B/C** because the division-scoped subtree (entries, payments,
  `league_schedule_matches`, `event_brackets`) already hangs off `division_id`,
  so the only thing "wrong" with the event-as-container was the time/location
  semantics, not the structure. B/C rebuild listing/SEO/event-detail for no
  structural gain pre-launch. B remains the documented escape hatch if
  cross-season identity or per-night check-in ever become hard requirements.
- **Standings are match-level, ranked by wins then score differential.**
  `league_schedule_matches` stores a single `home_score`/`away_score` per match
  (no set-by-set rows), so there's no set tally. Named the aggregate
  `pointsFor`/`pointsAgainst` generically and captioned the UI "sets or points"
  — the host decides what the score means; the diff is only a tiebreaker.
  Mirrors `computePoolStandings`'s v1 (no head-to-head tiebreak).
- **`computeLeagueStandings` takes a structural `LeagueMatchResult`**, not the
  `LeagueScheduleMatch` aggregate, so the season hub and the team-profile loader
  can both feed it (rehydrated entities _or_ raw rows) without rehydration.
- **Standings render server-side, outside the `<ScheduleWorkspace>` client
  island.** They derive only from recorded results (viewer-independent), so the
  schedule page stays cacheable (perf audit P2 #14); recording a result already
  `revalidatePath`s the page, so they refresh for free.
- **Team rollup is roster-only.** Records key on `teams.id`, which only roster
  entries carry — host-added `walk_in` entries have no team profile, so they're
  correctly absent (ADR 0034). Cross-season history falls out for free.
- **Reminders exclude leagues** rather than firing per-fixture. A league's
  `starts_at` is the season start, so the 24h/2h sweep would fire once at
  kickoff and misrepresent a months-long season. Per-fixture reminders are a
  separate future concern (the schedule lives in `league_schedule_matches`).
- **Left JSON-LD as-is.** A `SportsEvent` with `startDate`/`endDate` = the
  season window is truthful structured data; an `EventSeries` rework wasn't
  worth it now.

## Changes

- **Domain** — `packages/domain/src/leagues/standings.ts` (new):
  `computeLeagueStandings` + `LeagueStanding`/`LeagueMatchResult`; `standings.test.ts`
  (7 cases); exported from `leagues/index.ts`.
- **Season hub** — `events/[id]/schedule/_components/standings-section.tsx` (new),
  rendered above `<ScheduleWorkspace>` in `schedule/page.tsx`; page computes rows
  and name-resolves at the boundary.
- **Team profile** — `teams/[id]/_loaders/load-team-league-records.ts` (new,
  anon client, reuses `computeLeagueStandings` per division for record + rank);
  `teams/[id]/_components/team-league-records.tsx` (new); wired into
  `teams/[id]/page.tsx` between roster and viewer chrome.
- **Read-shape de-gathering** — `api/notifications/reminders/route.ts` (exclude
  `type='league'`); `events/[id]/page.tsx` ("When"→"Season" range for leagues +
  thread `endsAt` to hero); `events/[id]/_components/event-hero.tsx` (season
  sub-line, new `endsAt` prop); `events/_components/event-card.tsx` ("Season ·
  {date}" instead of the countdown — covers home/profile/events listings).

## Patterns observed

- **Per-`division_id` keying is what made Option A cheap.** Every league child
  table already keys on the division, so "is the parent an event or a league?"
  never had to be answered. Worth remembering before anyone reaches for a
  dedicated aggregate: check whether the subtree actually depends on the parent.
- **Branch the shared card on `type`, not the call sites.** The league "Season"
  label lives in `event-card.tsx` keyed on `event.type`, so it fixed home,
  profile, and the events list at once — no need to touch the 4 `relativeEventDay`
  call sites (the computed value is simply unused for leagues).

## Follow-ups

- **Ongoing-league upcoming/past classification (deferred — needs migration).**
  The `search_events` RPC buckets by `starts_at`, so a league that has started
  but not ended shows under "past." Fix = classify `type='league'` by `ends_at`
  in the RPC. Backlog: [event-data-model.md](../audits/event-data-model.md).
- **Per-fixture reminders for leagues (optional).** Now that the season is
  excluded from the event reminder sweep, weekly-match reminders would be a new,
  `league_schedule_matches`-driven sweep.
- **Phase 5 (optional): host round-robin schedule generator** reusing
  `generateRoundRobin` (brackets/generators.ts) to seed weekly fixtures instead
  of adding matches one at a time.
- **Team-rollup pagination** if a team accumulates many seasons (AGENTS.md
  pattern #12) — slow growth, skipped for v1.
