-- Backfill profiles for any auth.users that lack one (e.g. accounts created
-- before the on_auth_user_created trigger was installed). Idempotent.
insert into public.profiles (id, display_name)
select u.id,
       coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1), 'Player')
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null;
