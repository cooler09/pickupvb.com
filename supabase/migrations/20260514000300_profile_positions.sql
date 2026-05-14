-- Player positions on the profile. Up to three: primary, secondary, tertiary.
-- Stored as plain text columns with a CHECK constraint instead of a Postgres
-- enum so we can add new values via a migration without an ALTER TYPE dance.
--
-- Allowed values:
--   setter, outside, opposite, middle, libero, defensive_specialist
-- (UI labels live in apps/web/src/lib/enum-labels.ts.)

alter table public.profiles
    add column if not exists primary_position   text,
    add column if not exists secondary_position text,
    add column if not exists tertiary_position  text;

do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conname = 'profiles_primary_position_check'
    ) then
        alter table public.profiles
            add constraint profiles_primary_position_check
            check (primary_position is null or primary_position in (
                'setter', 'outside', 'opposite', 'middle', 'libero', 'defensive_specialist'
            ));
    end if;

    if not exists (
        select 1 from pg_constraint
         where conname = 'profiles_secondary_position_check'
    ) then
        alter table public.profiles
            add constraint profiles_secondary_position_check
            check (secondary_position is null or secondary_position in (
                'setter', 'outside', 'opposite', 'middle', 'libero', 'defensive_specialist'
            ));
    end if;

    if not exists (
        select 1 from pg_constraint
         where conname = 'profiles_tertiary_position_check'
    ) then
        alter table public.profiles
            add constraint profiles_tertiary_position_check
            check (tertiary_position is null or tertiary_position in (
                'setter', 'outside', 'opposite', 'middle', 'libero', 'defensive_specialist'
            ));
    end if;
end$$;
