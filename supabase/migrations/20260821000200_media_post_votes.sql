-- ============================================================================
-- Community award votes — per-event "Best clip" / "Biggest fail", voted by the
-- community on clip media posts. Builds on media_posts (20260820000000).
-- See docs/adr/0024-event-and-profile-media.md
--
-- Context: ADR 0024 deferred voting awards to a follow-up bundle; this is it.
-- A vote ties a voter to one clip per category per event (the unique key moves
-- the vote when they pick a different clip). Tallies are a live running count
-- (no reveal window). Only active `clip` posts are votable — enforced in the
-- app (MediaPost.assertVotable) and reflected in the counts view's filter.
--
-- Impact: new table `media_post_votes` + a public aggregate view
-- `media_post_vote_counts` (post_id, category, votes) with NO voter ids, so the
-- leaderboard is world-readable while individual ballots stay private (RLS:
-- own votes only). The view is `security_invoker = false` on purpose — it must
-- see all rows to tally; security_invoker = true would collapse counts to the
-- viewer's own vote. Additive only; no existing reads/writes change.
-- ============================================================================

-- ---- Table ----------------------------------------------------------------

create table public.media_post_votes (
    id            uuid primary key default uuid_generate_v4(),
    event_id      uuid not null references public.events(id) on delete cascade,
    post_id       uuid not null references public.media_posts(id) on delete cascade,
    category      text not null check (category in ('best_clip', 'biggest_fail')),
    voter_user_id uuid not null references public.profiles(id) on delete cascade,
    created_at    timestamptz not null default now(),
    -- One vote per category per voter per event; voting a different clip moves it.
    unique (event_id, category, voter_user_id)
);

create index media_post_votes_post_cat_idx on public.media_post_votes (post_id, category);
create index media_post_votes_event_idx    on public.media_post_votes (event_id);

-- ---- Public tally view (counts only — no voter ids) -----------------------
-- security_invoker = false (default, set explicitly): the view runs as owner so
-- it tallies ALL ballots. Only active clips count toward an award.

create view public.media_post_vote_counts
with (security_invoker = false) as
    select v.event_id, v.post_id, v.category, count(*)::int as votes
    from public.media_post_votes v
    join public.media_posts m on m.id = v.post_id
    where m.status = 'active' and m.kind = 'clip'
    group by v.event_id, v.post_id, v.category;

grant select on public.media_post_vote_counts to anon, authenticated;

-- ---- RLS ------------------------------------------------------------------

alter table public.media_post_votes enable row level security;

-- SELECT: a voter sees their own ballots (so the UI can highlight their picks);
-- admins see all. Aggregate counts are served by the view above, not the table.
create policy "media_post_votes_select" on public.media_post_votes
    for select
    using (
        voter_user_id = auth.uid()
        or public.is_platform_admin()
    );

-- INSERT: authenticated non-anonymous user voting as themselves.
create policy "media_post_votes_insert" on public.media_post_votes
    for insert
    with check (
        auth.uid() is not null
        and voter_user_id = auth.uid()
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    );

-- UPDATE: the upsert's conflict path (moving a vote to another clip).
create policy "media_post_votes_update" on public.media_post_votes
    for update
    using (voter_user_id = auth.uid())
    with check (voter_user_id = auth.uid());

-- DELETE: retract your own vote.
create policy "media_post_votes_delete" on public.media_post_votes
    for delete
    using (voter_user_id = auth.uid());
