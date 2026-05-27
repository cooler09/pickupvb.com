-- ============================================================================
-- Invite-only events: make `visibility = 'invite_only'` readable by anyone
-- with the URL (anon or signed-in). Until now `invite_only` was fully
-- locked — only the host / co-hosts / group admins could see the row, so
-- shared URLs returned 404 to everyone else. The original init.sql comment
-- next to events_select already flagged this: "invite_only requires
-- explicit invite (not modeled yet)".
--
-- Context: monetization audit P1 #1 carves "Invite-only / private events"
-- out as a Pro perk and the pricing page already advertises it. This
-- migration delivers the missing read path: an unlisted-link model
-- ("YouTube unlisted") where the event is excluded from /events, search,
-- and the sitemap (all of which filter `visibility = 'public'` at the
-- query / view layer), but the canonical `/events/[id]` URL is shareable.
-- The new-event and edit-event server actions land in the same bundle and
-- clamp `visibility` to 'public' for hosts without Pro benefits, so the
-- write side stays gated.
--
-- Impact: anon and signed-in viewers can now SELECT events whose
-- visibility is 'invite_only'. Reads on 'friends_of_host' and
-- 'friends_of_attendees' are unchanged (still require the friendship
-- relation). Listing / sitemap / search queries already filter on
-- `visibility = 'public'`, so this does not leak invite_only events into
-- discovery surfaces. RLS-protected child tables (attendees, teams,
-- divisions, …) inherit their own policies — unchanged here.
-- ============================================================================

drop policy if exists events_select on public.events;

create policy events_select on public.events for select using (
  -- Always visible to the manager (host_id user) and to admins of the host group.
  auth.uid() = host_id
  or (
    host_group_id is not null
    and exists (
      select 1 from public.group_members gm
       where gm.group_id = events.host_group_id
         and gm.user_id  = auth.uid()
         and gm.role in ('owner', 'admin')
    )
  )
  -- Always visible to listed co-hosts (user co-hosts, or admins of co-host groups).
  or exists (
    select 1 from public.event_co_hosts ch
     where ch.event_id = events.id
       and (
         ch.host_user_id = auth.uid()
         or (ch.host_group_id is not null and exists (
           select 1 from public.group_members gm
            where gm.group_id = ch.host_group_id
              and gm.user_id  = auth.uid()
              and gm.role in ('owner', 'admin')
         ))
       )
  )
  or (
    status = 'published' and (
      visibility = 'public'
      -- NEW: invite_only events are readable by anyone holding the URL.
      -- Discovery surfaces (/events, search RPC, sitemap, public_numbers
      -- views) all filter `visibility = 'public'` so these never leak
      -- into listings. The Pro-gating on the write path lives in the
      -- new-event and edit-event server actions.
      or visibility = 'invite_only'
      or (
        visibility = 'friends_of_host' and (
          -- Follows the primary user host
          exists (
            select 1 from public.friendships f
             where f.user_id = events.host_id
               and f.friend_id = auth.uid()
          )
          -- Or follows / is a member of the primary group host
          or (host_group_id is not null and (
            exists (
              select 1 from public.group_followers gf
               where gf.group_id = events.host_group_id
                 and gf.user_id  = auth.uid()
            )
            or exists (
              select 1 from public.group_members gm
               where gm.group_id = events.host_group_id
                 and gm.user_id  = auth.uid()
            )
          ))
          -- Or follows / is a member of any co-host party
          or exists (
            select 1 from public.event_co_hosts ch
             where ch.event_id = events.id
               and (
                 (ch.host_user_id is not null and exists (
                    select 1 from public.friendships f
                     where f.user_id = ch.host_user_id
                       and f.friend_id = auth.uid()
                 ))
                 or (ch.host_group_id is not null and (
                    exists (
                      select 1 from public.group_followers gf
                       where gf.group_id = ch.host_group_id
                         and gf.user_id  = auth.uid()
                    )
                    or exists (
                      select 1 from public.group_members gm
                       where gm.group_id = ch.host_group_id
                         and gm.user_id  = auth.uid()
                    )
                 ))
               )
          )
        )
      )
      or (
        visibility = 'friends_of_attendees' and exists (
          select 1 from public.event_attendees a
            join public.friendships f on f.user_id = a.user_id and f.friend_id = auth.uid()
           where a.event_id = events.id
        )
      )
    )
  )
);
