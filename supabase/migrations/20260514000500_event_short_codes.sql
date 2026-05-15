-- Shareable short codes for events.
--
-- Adds a unique, URL-safe alias to public.events so we can render compact
-- share links like /e/ABC23XYZ that redirect to /events/<uuid>.
--
-- Encoding: 8 chars from a 32-char alphabet (Crockford-ish: digits + uppercase
-- letters minus I, L, O, U) → ~10^12 combinations. Collisions are detected by
-- the unique index; the trigger retries up to 5 times before bubbling.

create or replace function public.gen_event_short_code()
returns text
language plpgsql
as $$
declare
    alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    code     text := '';
    i        int;
begin
    for i in 1..8 loop
        code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    return code;
end;
$$;

alter table public.events
    add column if not exists short_code text;

create unique index if not exists events_short_code_key
    on public.events (short_code);

create or replace function public.events_assign_short_code()
returns trigger
language plpgsql
as $$
declare
    candidate text;
    attempts  int := 0;
begin
    if new.short_code is not null then
        return new;
    end if;
    loop
        candidate := public.gen_event_short_code();
        begin
            new.short_code := candidate;
            return new;
        exception when unique_violation then
            attempts := attempts + 1;
            if attempts >= 5 then
                raise;
            end if;
        end;
    end loop;
end;
$$;

drop trigger if exists events_assign_short_code on public.events;
create trigger events_assign_short_code
    before insert on public.events
    for each row
    execute function public.events_assign_short_code();

-- Backfill existing rows. Loop one row at a time so a collision only retries
-- that row (a set-based update would abort on the first conflict).
do $$
declare
    r record;
    candidate text;
    attempts int;
begin
    for r in select id from public.events where short_code is null loop
        attempts := 0;
        loop
            candidate := public.gen_event_short_code();
            begin
                update public.events
                    set short_code = candidate
                    where id = r.id;
                exit;
            exception when unique_violation then
                attempts := attempts + 1;
                if attempts >= 10 then
                    raise;
                end if;
            end;
        end loop;
    end loop;
end;
$$;

alter table public.events
    alter column short_code set not null;

-- The events_view is `select e.*` so it picks up the new column automatically.
