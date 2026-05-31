-- ============================================================================
-- Event team entries: add `forfeited_at` for mid-season league forfeits.
-- See docs/audits/event-data-model.md § P2 #7.
--
-- Context: P2 #7 closes the league rostered-team model. Tournament teams
-- live for one weekend and only need soft-delete (`deleted_at`) on
-- withdrawal. League teams live for an entire season; a mid-season
-- forfeit is a distinct lifecycle event from "deleted" — the team row
-- stays present so the schedule generator can skip remaining matches
-- and the standings page can render "Forfeited week 5". Per the audit
-- recommendation this is a tiny additive column on event_team_entries
-- (no new aggregate, no league-specific table). Same column works for
-- tournament forfeits if/when hosts ask for it.
--
-- Impact: additive only. No data backfill required (column is nullable
-- with default null). No RLS / view / trigger changes — the column is
-- read by future application code (league schedule rendering) and
-- written by a future host action. Domain aggregate
-- (EventTeamRegistration) is intentionally not threaded in this
-- migration: P2 #7 explicitly defers the domain wiring until a
-- league host asks for forfeit UI. Schema lands now so callers
-- can opt in without another migration round-trip.
-- ============================================================================

alter table public.event_team_entries
  add column forfeited_at timestamptz;

comment on column public.event_team_entries.forfeited_at is
  'Set when a team forfeits mid-event (league mid-season forfeit per '
  'docs/audits/event-data-model.md § P2 #7, or same-day tournament '
  'forfeit). Distinct from deleted_at: the row stays visible to the '
  'schedule generator / standings render. Null = active. UI '
  'consumers: future league schedule + standings surfaces.';
