-- Allow users to see incoming friend edges (i.e. who has added them as a friend).
-- Without this, the profile page can't show the "Mutual" badge.
-- Outgoing edges are still restricted to the row's owner via the original policy;
-- write/delete policies are unchanged (you can only manage your own outgoing edges).
create policy friendships_select_inbound on public.friendships
  for select
  using (auth.uid() = friend_id);
