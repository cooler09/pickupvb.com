-- Track when reminder notifications were sent for each attendee, so the
-- reminders cron can find "not yet reminded" rows in O(index) time.
--
-- We dedupe at the caller (not via UNIQUE on `notifications`) because the
-- in-app feed is meant to be a flat append-only log — multiple notifications
-- for the same logical event (different kinds) are legitimate.
alter table public.event_attendees
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_2h_sent_at  timestamptz;

-- Partial index speeds up the "find me un-reminded attendees for events
-- starting in the next N hours" query.
create index if not exists event_attendees_reminder_24h_pending_idx
  on public.event_attendees (event_id)
  where reminder_24h_sent_at is null;

create index if not exists event_attendees_reminder_2h_pending_idx
  on public.event_attendees (event_id)
  where reminder_2h_sent_at is null;
