-- Team member invite confirmation flow.
--
-- Adds a `status` column to `team_members` so a captain "adding" a player
-- actually creates a pending invite that the player must accept. Players who
-- prefer the previous behavior can opt out by setting
-- `profiles.auto_accept_team_invites = true`, in which case the captain's
-- add inserts a row already in the 'active' state.
--
-- Existing rows are backfilled to 'active' (they pre-date the invite flow,
-- so they are considered already-accepted memberships).

alter table public.profiles
    add column if not exists auto_accept_team_invites boolean not null default false;

alter table public.team_members
    add column if not exists status text not null default 'active'
        check (status in ('active', 'pending')),
    add column if not exists invited_at timestamptz;

-- Allow an invitee to update their own row (used to flip pending -> active).
-- The check clause prevents flipping someone else's row and prevents demoting
-- back to pending.
drop policy if exists team_members_self_accept on public.team_members;
create policy team_members_self_accept on public.team_members
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id and status = 'active');
