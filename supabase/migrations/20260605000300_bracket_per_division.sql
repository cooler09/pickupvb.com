-- ADR-0006 Phase 7: one bracket per event division.
--
-- The original tournament_brackets schema enforced a single bracket per
-- event via `event_id unique`. Now that events can carry multiple divisions
-- (different skill tiers / age groups / formats), each division gets its
-- own bracket. The host picks a format per division and seeds independently.
--
-- Backfill is straightforward: every existing event has exactly one
-- division (created by the Phase 6 backfill), so each existing bracket
-- maps 1:1 to that division.

alter table public.tournament_brackets
  add column if not exists division_id uuid
    references public.event_divisions(id) on delete cascade;

-- Backfill: each bracket → the single division of its event.
update public.tournament_brackets b
   set division_id = d.id
  from public.event_divisions d
 where d.event_id = b.event_id
   and b.division_id is null;

-- Anything left over means an orphan bracket whose event has no division.
-- Refuse to migrate silently — the constraint flip below would fail with a
-- worse error message.
do $$
declare
  v_orphans int;
begin
  select count(*) into v_orphans
    from public.tournament_brackets
   where division_id is null;
  if v_orphans > 0 then
    raise exception
      'tournament_brackets has % rows without a matching event_division',
      v_orphans;
  end if;
end $$;

alter table public.tournament_brackets
  alter column division_id set not null;

-- Drop the legacy "one bracket per event" uniqueness. The implicit unique
-- constraint name follows Postgres convention; guard against environments
-- where it may have been renamed.
do $$
declare
  v_conname text;
begin
  select conname into v_conname
    from pg_constraint
   where conrelid = 'public.tournament_brackets'::regclass
     and contype  = 'u'
     and pg_get_constraintdef(oid) ilike '%(event_id)%';
  if v_conname is not null then
    execute format(
      'alter table public.tournament_brackets drop constraint %I',
      v_conname
    );
  end if;
end $$;

-- New uniqueness: one bracket per division.
create unique index if not exists tournament_brackets_division_uidx
  on public.tournament_brackets (division_id);

create index if not exists tournament_brackets_division_idx
  on public.tournament_brackets (division_id);
