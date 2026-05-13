-- Add structured first/last name fields to profiles. display_name remains the
-- canonical "shown" name (so existing UI keeps working) but new sign-ups and
-- profile edits can populate first/last separately.
alter table public.profiles
  add column if not exists first_name text check (first_name is null or length(first_name) between 1 and 60),
  add column if not exists last_name  text check (last_name  is null or length(last_name)  between 1 and 60);

-- Refresh the new-user trigger to capture first/last name from sign-up metadata
-- when present. display_name still falls back to the email local-part.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_first text := nullif(new.raw_user_meta_data->>'first_name', '');
  v_last  text := nullif(new.raw_user_meta_data->>'last_name', '');
  v_display text := coalesce(
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(trim(concat_ws(' ', v_first, v_last)), ''),
    split_part(new.email, '@', 1)
  );
begin
  insert into public.profiles (id, display_name, first_name, last_name)
  values (new.id, v_display, v_first, v_last)
  on conflict (id) do nothing;
  return new;
end;
$$;
