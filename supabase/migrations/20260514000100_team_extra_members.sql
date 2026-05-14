-- Captains can record how many additional players are on the team but not on
-- the site. These don't have profiles; they exist only as a count so the
-- captain can communicate full roster size and so capacity checks include
-- them. Defaults to 0 (the existing behavior).
alter table public.teams
    add column if not exists extra_member_count int not null default 0
        check (extra_member_count >= 0 and extra_member_count <= 20);
