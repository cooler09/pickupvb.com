# Leagues: deferred-item follow-ups (2026-06-06)

## Context

Follow-up to [2026-06-05-bundle-leagues-container-model.md](2026-06-05-bundle-leagues-container-model.md).
That bundle left four deferred items; this one closes three and consciously
keeps the fourth deferred.

## Decisions

- **Classify leagues by `ends_at` in all three discovery reads, not just the
  RPC.** The deferred note named `search_events`, but the same `starts_at`
  classification lived in `listAttending` (profile "upcoming you joined") and
  `searchFollowingFeed` (Following tab). Fixing one and leaving two would be a
  half-fix, so all three now treat a league as "upcoming" until `ends_at`.
- **RPC via raw-SQL `CASE`; builder queries via PostgREST `.or()`.** The RPC
  gets `case when type='league' then ends_at else starts_at end` in the two date
  filters + the default ordering (deterministic, no signature change → existing
  grant survives). The two supabase-js queries can't express that in the builder,
  so they use `.or(and(type.neq.league,starts_at.gte.X),and(type.eq.league,ends_at.gte.X))`
  — chosen over fetch-then-filter because the queries are `.limit()`-bounded
  (filtering after the limit would drop valid rows). The date `.or()` ANDs with
  `searchFollowingFeed`'s existing host/attendee `.or()` (PostgREST ANDs multiple
  `or=` params).
- **Clear-schedule wipes via the full-replace `save`**, persisting an empty
  schedule rather than adding a `clear()` to the aggregate — `save` is already a
  delete+reinsert, so an empty slate is a clean wipe. It's the host counterpart
  to "generate" (which refuses a non-empty slate), and it confirms first
  (`ConfirmSubmitButton`, destructive) because it also deletes recorded scores.
- **Bounded the team rollup with a cap, not pagination.** The team page is
  ISR-cached (`revalidate = 60`); reading a `?page=` searchParams forces dynamic
  rendering. A team gains only a few league seasons per year, so a cap of 12
  most-recent seasons honours pattern #12's "bound the list" intent without
  sacrificing the page's static caching.
- **Per-fixture league reminders stay deferred.** It's a materially larger
  feature — a new cron sweep over `league_schedule_matches`, a dedupe column
  migration, an open "who gets reminded" (rostered players vs. captains) design
  question, and it can't be verified on dev (Vercel cron is production-only). Not
  worth bundling into a follow-up sweep; it deserves its own design pass.

## Changes

- **#1 classification** — `supabase/migrations/20260915000000_search_events_league_ends_at_classification.sql`
  (new; `create or replace search_events`, body otherwise unchanged);
  `supabase-event-repository.ts` `listAttending` and
  `supabase-social-graph-repository.ts` `searchFollowingFeed` (`.gte('starts_at')`
  → league-aware `.or()`).
- **#3 clear schedule** — `ClearLeagueSchedule{Command,Handler}` in
  `league-schedule.handler.ts` (+2 tests); wired in `lib/handlers.ts`;
  `clearScheduleFromForm` action + `cleared` notice; `ConfirmSubmitButton` form in
  `schedule-workspace.tsx` (host-only, when matches exist).
- **#4 rollup bound** — `load-team-league-records.ts` caps at 12 most-recent
  seasons.

## Patterns observed

- **A "fix the RPC" note can hide sibling builder queries.** The same date
  classification was duplicated in two supabase-js reads that don't call the RPC.
  When fixing a query-shaped bug, grep for the column/predicate across the infra
  adapters, not just the named function.
- **ISR caching vs. pattern #12.** Pagination's searchParams read silently
  converts an ISR page to dynamic. For a slow-growing per-entity list, a cap is
  the right bound; reserve real pagination for genuinely unbounded directories.

## Follow-ups

- **Per-fixture league reminders** (deferred, see Decisions) — needs its own
  design: audience resolution + a dedupe column on `league_schedule_matches` +
  a new cron route + Vercel cron config.
- **Verify the league `ends_at` classification on dev after deploy** — the
  `.or()` builder filters and the RPC `CASE` are read-only but unverifiable in the
  local quad (no local Supabase); confirm an in-progress league shows under
  "upcoming" on `/events`, the profile, and the Following tab once deployed.
