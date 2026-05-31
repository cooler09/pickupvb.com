-- ============================================================================
-- Event divisions: add `position_roster` jsonb for open-play positional sign-up.
-- See docs/audits/event-data-model.md § P3 #9 deferred follow-up.
--
-- Context: ADR 0006 Phase 9d dropped `events.position_roster` and migrated
-- all other primary-division mirror columns (format/gender/skill_level/
-- capacity_kind/max_spots/price_cents) onto `event_divisions`. The
-- `position_roster` move was the one column that never landed on its new
-- home — Phase 9d only dropped it from `events`. Since then the
-- aggregate's `positionRoster` field has had no persistent home: the
-- infrastructure repo reads from a non-existent `events.position_roster`
-- column (always returns null) and the save path explicitly skips it.
-- Open-play positional sign-up is therefore silently broken on the write
-- side — host submissions are accepted but never round-tripped. This
-- migration restores persistence by adding the column to
-- `event_divisions`, matching the division-centric authority pattern.
--
-- Open-play events are single-division by invariant (P1 #3, enforced in
-- VolleyballEvent), so the aggregate-level `positionRoster` field stamps
-- onto the one and only division row at save time. The column stays
-- nullable for tournament / league divisions where positional sign-up
-- is non-applicable.
--
-- Impact: additive only. No backfill needed — there are no production
-- events with positional sign-up that lost data (pre-launch repo). The
-- existing `events_view` is unaffected (it never picked up the column
-- after Phase 9d dropped the old one). Infra `EventRow` and
-- `DivisionRow` types are updated in the same PR so reads/writes route
-- to the new column.
-- ============================================================================

alter table public.event_divisions
  add column position_roster jsonb;

comment on column public.event_divisions.position_roster is
  'Open-play positional sign-up roster, e.g. {"setter":1,"outside":2}. '
  'Null when the division does not use positional sign-up (default). '
  'Tournament/league divisions leave this null. Mirrors the aggregate '
  'field VolleyballEvent.positionRoster; open-play events are '
  'single-division by invariant so the aggregate stamps onto divisions[0].';
