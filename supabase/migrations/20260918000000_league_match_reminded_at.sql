-- ============================================================================
-- Per-fixture league reminders — dedupe column.
-- See docs/journal/2026-06-06-bundle-league-match-reminders.md (design note).
--
-- Context: leagues schedule per-week fixtures (league_schedule_matches), but
-- nothing reminded the rostered players a match was coming up — the last
-- reminder gap after event-attendee 24h/2h reminders. A cron sweep
-- (/api/notifications/league-reminders) fans a `league.match.reminder` out to
-- both teams' rostered players ~24h before kickoff. This column is the
-- once-per-match dedupe (mirrors the per-attendee reminder_24h_sent_at columns):
-- the sweep stamps it after delivering so a later run in the same wide window
-- doesn't re-remind.
--
-- Impact: one nullable column on league_schedule_matches. Additive; no existing
-- reads/writes change. The sweep reads/writes it on the service-role client via
-- a string select + local Row type (the table's generated types are already
-- stale post-20260910 entry-id cutover), so generated types don't gate this —
-- regenerate on the next gen:types run regardless.
-- ============================================================================

alter table public.league_schedule_matches
    add column reminded_at timestamptz;

-- Partial index for the sweep's hot predicate: scheduled, not-yet-reminded,
-- ordered by kickoff.
create index league_schedule_matches_reminder_idx
    on public.league_schedule_matches (scheduled_at)
    where reminded_at is null and status = 'scheduled';
