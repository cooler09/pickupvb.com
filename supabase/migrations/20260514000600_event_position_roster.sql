-- Positional sign-ups for open-play events.
--
-- Hosts can optionally configure how many players they want at each volleyball
-- position (Setter, Outside, Opposite, Middle, Libero, Defensive Specialist).
-- When set, players pick a position when they sign up. Over-fill is allowed
-- (waitlist style) — the domain decides who counts as "rostered" vs "waitlist".
--
-- Storage:
--   events.position_roster  jsonb   {"setter":1,"outside":2,...} or NULL
--   event_attendees.position text   one of the position values, or NULL when
--                                   the event isn't using positional signups.

alter table public.events
    add column if not exists position_roster jsonb;

alter table public.event_attendees
    add column if not exists position text;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'event_attendees_position_check'
    ) then
        alter table public.event_attendees
            add constraint event_attendees_position_check
            check (position is null or position in (
                'setter','outside','opposite','middle','libero','defensive_specialist'
            ));
    end if;
end$$;

-- events_view uses `select e.*` so position_roster propagates automatically.
