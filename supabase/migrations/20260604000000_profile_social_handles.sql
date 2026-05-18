-- Add optional social media handles + a generic website URL to profiles so
-- players can link out from their public player page. All nullable; UI
-- normalizes input (strips leading "@" and URL prefixes) before persisting,
-- so columns store the bare handle (e.g. "jane.doe"), never a full URL.
-- `website_url` is the only field that stores a full URL (with scheme).
--
-- No CHECK constraint on shape — keep server-side validation in the action
-- so we can evolve it without a migration. Length caps protect the DB.

alter table public.profiles
  add column if not exists instagram_handle text,
  add column if not exists tiktok_handle    text,
  add column if not exists twitter_handle   text,
  add column if not exists facebook_handle  text,
  add column if not exists youtube_handle   text,
  add column if not exists website_url      text;

alter table public.profiles
  add constraint profiles_instagram_handle_len
    check (instagram_handle is null or char_length(instagram_handle) between 1 and 60),
  add constraint profiles_tiktok_handle_len
    check (tiktok_handle is null or char_length(tiktok_handle) between 1 and 60),
  add constraint profiles_twitter_handle_len
    check (twitter_handle is null or char_length(twitter_handle) between 1 and 60),
  add constraint profiles_facebook_handle_len
    check (facebook_handle is null or char_length(facebook_handle) between 1 and 80),
  add constraint profiles_youtube_handle_len
    check (youtube_handle is null or char_length(youtube_handle) between 1 and 80),
  add constraint profiles_website_url_len
    check (website_url is null or char_length(website_url) between 1 and 200);
