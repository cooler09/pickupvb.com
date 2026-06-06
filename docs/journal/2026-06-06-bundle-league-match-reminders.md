# Per-fixture league reminders (2026-06-06)

## Context

Phase 3c — the last item of the "wrap up outstanding items" plan and the
deferred follow-up from the leagues bundle. Event-attendee reminders (24h/2h)
intentionally skip leagues (a league's `starts_at` is the season start, not a
fixture), so a league's weekly fixtures in `league_schedule_matches` reminded
nobody. This adds a cron that pings both teams' rostered players ~24h before a
fixture. Doubles as the design note the plan asked for.

## Decisions

- **Audience = active rostered players of both teams.** Resolved
  `home_entry_id`/`away_entry_id` → `event_team_entries.team_id` →
  `team_members` filtered to `status = 'active'` (pending invitees aren't on the
  team yet). Captains are roster members, so they're covered. Walk-in
  (account-less) entries have `team_id = null` → no recipients; they only ever
  appear as the _opponent's_ name. (Chosen over "captains only" — the players are
  who need to show up; the user left the audience open, this is the inclusive
  default.)
- **One 24h window (22h–26h) + a per-match `reminded_at` dedupe.** The cron fires
  every 30 min; the wide window guarantees a fixture is seen, the dedupe column
  guarantees it pings once. Modeled on the event-reminder sweep's window+column
  pattern, but the dedupe is per-_match_ (one column on the fixture), not
  per-recipient — a fixture is a single logical reminder to a roster.
- **Pure sweep core + Supabase port + thin route**, exactly like the
  event-reminder sweep, so the window / cap / opponent-mapping / dedupe is
  unit-tested without IO.
- **Mark per fixture, after its recipients dispatch.** A `maxDuration` timeout
  only strands the _un-dispatched_ fixtures (unmarked → next run picks them up);
  the per-recipient `matchId:userId` idempotency key keeps a re-run from
  re-mailing/re-pushing the already-done ones (only in_app could duplicate).
- **Resolve recipients in TS steps on the admin client, not a PostgREST embed.**
  The `league_schedule_matches` generated types lag the 20260910 entry-id cutover
  (they still show `home_team_id`), so embeds against the new FK metadata are
  fragile; the route does division→event, entry→team, team→members as explicit
  `.in()` lookups (repo convention for this table). I hand-edited the generated
  types to add `home_entry_id`/`away_entry_id`/`reminded_at` so the filters
  typecheck (regenerate on the next `gen:types`).
- **New `league.match.reminder` kind** (category `event_reminders` so it honors
  reminder prefs; email+push+in_app), deep-linking to `/events/<id>/schedule`,
  with the recipient's _opponent_ in the copy.

## Changes

- Migration `20260918000000_league_match_reminded_at.sql` (dedupe column +
  partial index); hand-edited `database.types.ts` league columns.
- `packages/notifications/src/kinds.ts` + `templates.ts` — `league.match.reminder`.
- `apps/web/src/app/api/notifications/league-reminders/sweep.ts` (pure core) +
  `route.ts` (Supabase port + `notify` + `CRON_SECRET`); `sweep.test.ts` (4).
- `apps/web/vercel.json` — `*/30` cron for the new route.

## Patterns observed

- **A stale generated-types table is a recurring tax.** This is the second
  feature this session (after `list_room_recipients`) to hand-edit
  `database.types.ts` ahead of `gen:types`. The league table specifically lags
  the entry-id cutover — anything new touching it must add the entry columns by
  hand and read via `.in()` steps, not embeds.

## Follow-ups

- **Ops + deploy-gated (the heaviest gate of the lot):** Vercel Cron is
  **production-only**, so this route never fires on dev/preview (same root cause
  as the "push doesn't work" finding). It also depends on the dev/prod notif
  worker actually draining the outbox. Verify on **production**: a fixture ~24h
  out pings both rosters once and `reminded_at` stamps. Nothing to verify on dev.
- **Tuning:** the 22h–26h window + `*/30` cadence is a first cut; widen/narrow
  after watching real delivery. A 2h "starting soon" league reminder could be a
  second window later (same sweep, add a column).
