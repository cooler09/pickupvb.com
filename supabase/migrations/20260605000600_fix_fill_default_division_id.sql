-- Fix: fill_default_division_id() used max(id) on a uuid column, which
-- Postgres rejects ("function max(uuid) does not exist"). Replace with a
-- count + a separate single-row lookup. Behaviour is unchanged: when an
-- event has exactly one division, populate new.division_id with that id;
-- otherwise leave it null and let the application enforce the requirement.

create or replace function public.fill_default_division_id()
returns trigger language plpgsql as $$
declare
  v_count int;
  v_division_id uuid;
begin
  if new.division_id is not null then
    return new;
  end if;

  select count(*) into v_count
    from public.event_divisions
   where event_id = new.event_id;

  if v_count = 1 then
    select id into v_division_id
      from public.event_divisions
     where event_id = new.event_id
     limit 1;
    new.division_id := v_division_id;
  end if;

  return new;
end;
$$;
