-- Per-user toggle for showing the Pro badge on public pages. Defaults to true
-- (Pro hosts get the badge by default; can opt out for low-key vibes).
alter table public.profiles
    add column if not exists show_pro_badge boolean not null default true;
