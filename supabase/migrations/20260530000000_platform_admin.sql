-- Platform-wide admin flag on profiles.
--
-- Used by features that need a single global moderator role separate from
-- group-scoped owner/admin/member. For Phase 1 this is consumed by the
-- community_listings RLS so admins can edit/hide any listing.
--
-- There is no UI to grant this yet; flip a user manually with:
--   update public.profiles set is_platform_admin = true where id = '<uuid>';

alter table public.profiles
    add column if not exists is_platform_admin boolean not null default false;

comment on column public.profiles.is_platform_admin is
    'When true, the user has platform-wide moderator powers. Grant manually via SQL.';

-- Helper for RLS policies: returns true iff the calling user is a platform admin.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select is_platform_admin from public.profiles where id = auth.uid()),
        false
    );
$$;

grant execute on function public.is_platform_admin() to authenticated, anon;
