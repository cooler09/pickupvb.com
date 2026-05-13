-- Make events.format and events.gender optional.
-- Tournaments still require both (enforced in the application/domain layer);
-- open-play events may leave them null.

alter table public.events
  alter column format drop not null,
  alter column gender drop not null;

-- Existing CHECK fails when format is null; rewrite to skip nulls.
alter table public.events drop constraint events_indoor_format;
alter table public.events add constraint events_indoor_format check (
  format is null or surface <> 'indoor' or format in ('sixes', 'quads')
);

-- Tournament-specific requirement at the DB level (defense in depth).
alter table public.events add constraint events_tournament_requires_format check (
  type <> 'tournament' or (format is not null and gender is not null)
);
