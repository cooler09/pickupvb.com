-- ============================================================================
-- Vanity URLs: slug on teams, handle on profiles
-- ----------------------------------------------------------------------------
-- Replaces UUIDs in /teams/<id> and /players/<id> with human-readable tokens.
-- Groups already have a `slug` column (see 20260513000700) so we don't touch
-- them here.
--
-- Strategy:
--   * teams.slug    = slugify(name) || '-' || gen_short_id(6)
--   * profiles.handle = slugify(display_name or first/last) || '-' || gen_short_id(6)
--
-- A short random suffix avoids unique-collision pain on common names
-- ("Zach", "Sand Court Crushers"). Users can change their handle later via
-- the profile page (uniqueness enforced by a UNIQUE constraint).
-- ============================================================================

-- ---- Helpers ---------------------------------------------------------------

-- slugify(): lowercase, replace non-alnum runs with '-', strip edge dashes.
create or replace function public.slugify(input text)
returns text language sql immutable as $$
    select trim(both '-' from regexp_replace(
        regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'),
        '-+', '-', 'g'
    ));
$$;

-- gen_short_id(): N-char base36 random suffix (default 6 → ~2.2B keyspace).
create or replace function public.gen_short_id(len int default 6)
returns text language sql volatile as $$
    select string_agg(
        substr(
            '0123456789abcdefghijklmnopqrstuvwxyz',
            1 + floor(random() * 36)::int,
            1
        ),
        ''
    )
    from generate_series(1, len);
$$;

-- ---- TEAMS: add slug -------------------------------------------------------

alter table public.teams add column slug text;

create or replace function public.teams_assign_slug()
returns trigger language plpgsql as $$
declare
    base text;
    candidate text;
    tries int := 0;
begin
    -- Allow caller-supplied slug (admin tooling) — only auto-fill when blank.
    if new.slug is not null and length(new.slug) > 0 then
        return new;
    end if;
    base := nullif(public.slugify(new.name), '');
    if base is null then base := 'team'; end if;
    -- Leave room for the '-xxxxxx' suffix inside our 65-char ceiling.
    base := substr(base, 1, 40);
    loop
        candidate := base || '-' || public.gen_short_id(6);
        exit when not exists (select 1 from public.teams where slug = candidate);
        tries := tries + 1;
        if tries > 8 then
            candidate := base || '-' || public.gen_short_id(10);
            exit;
        end if;
    end loop;
    new.slug := candidate;
    return new;
end;
$$;

create trigger teams_assign_slug_before_insert
    before insert on public.teams
    for each row execute function public.teams_assign_slug();

-- Backfill existing teams.
do $$
declare
    r record;
    base text;
    candidate text;
    tries int;
begin
    for r in select id, name from public.teams where slug is null loop
        base := substr(coalesce(nullif(public.slugify(r.name), ''), 'team'), 1, 40);
        tries := 0;
        loop
            candidate := base || '-' || public.gen_short_id(6);
            exit when not exists (select 1 from public.teams where slug = candidate);
            tries := tries + 1;
            if tries > 20 then
                candidate := base || '-' || public.gen_short_id(12);
                exit;
            end if;
        end loop;
        update public.teams set slug = candidate where id = r.id;
    end loop;
end$$;

alter table public.teams
    alter column slug set not null,
    add constraint teams_slug_key unique (slug),
    add constraint teams_slug_format
        check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}[a-z0-9]$');

create index teams_slug_idx on public.teams (slug);

-- ---- PROFILES: add handle --------------------------------------------------

alter table public.profiles add column handle text;

create or replace function public.profiles_assign_handle()
returns trigger language plpgsql as $$
declare
    base text;
    candidate text;
    tries int := 0;
    source text;
begin
    if new.handle is not null and length(new.handle) > 0 then
        return new;
    end if;
    source := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
    if source = '' or source is null then source := new.display_name; end if;
    base := substr(coalesce(nullif(public.slugify(source), ''), 'player'), 1, 40);
    loop
        candidate := base || '-' || public.gen_short_id(6);
        exit when not exists (select 1 from public.profiles where handle = candidate);
        tries := tries + 1;
        if tries > 8 then
            candidate := base || '-' || public.gen_short_id(10);
            exit;
        end if;
    end loop;
    new.handle := candidate;
    return new;
end;
$$;

create trigger profiles_assign_handle_before_insert
    before insert on public.profiles
    for each row execute function public.profiles_assign_handle();

-- Backfill existing profiles.
do $$
declare
    r record;
    base text;
    candidate text;
    tries int;
    source text;
begin
    for r in select id, display_name, first_name, last_name from public.profiles where handle is null loop
        source := trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, ''));
        if source = '' or source is null then source := r.display_name; end if;
        base := substr(coalesce(nullif(public.slugify(source), ''), 'player'), 1, 40);
        tries := 0;
        loop
            candidate := base || '-' || public.gen_short_id(6);
            exit when not exists (select 1 from public.profiles where handle = candidate);
            tries := tries + 1;
            if tries > 20 then
                candidate := base || '-' || public.gen_short_id(12);
                exit;
            end if;
        end loop;
        update public.profiles set handle = candidate where id = r.id;
    end loop;
end$$;

alter table public.profiles
    alter column handle set not null,
    add constraint profiles_handle_key unique (handle),
    add constraint profiles_handle_format
        check (handle ~ '^[a-z0-9][a-z0-9-]{1,63}[a-z0-9]$');

create index profiles_handle_idx on public.profiles (handle);
