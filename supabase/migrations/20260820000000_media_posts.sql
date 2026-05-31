-- ============================================================================
-- Media posts — user-submitted external videos, livestreams, and clips on
-- events and profiles. PickupVB hosts nothing: a post points at an external
-- source (YouTube, Twitch, Instagram, TikTok, Facebook, or any other https
-- link) and the app embeds it (YouTube/Twitch) or renders a link card.
-- See docs/adr/0024-event-and-profile-media.md
--
-- Context: video/livestreaming is central to the volleyball community but the
-- schema had no media concept. This mirrors `community_listings`
-- (20260530000100) as the UGC-points-at-external-URL template: same moderation
-- lifecycle (active/hidden/removed), report table + auto-hide trigger,
-- short-code trigger, and anonymous-auth RLS. Adds two things listings don't
-- have: a `featured` flag (host-promoted live stream, one per event) and the
-- provider/external_id classification used to build first-party embeds.
--
-- Impact: new tables `media_posts` + `media_post_reports`, a host-gated
-- `feature_event_stream(event_id, media_id)` RPC, and a `SECURITY DEFINER`
-- after-report trigger (so report counting / auto-hide works when the report
-- is filed on the user-scoped client, unlike the listings version which counts
-- on the admin client). Additive only — no existing reads/writes change. The
-- partial unique index enforces at-most-one featured live stream per event.
-- ============================================================================

-- ---- Tables ---------------------------------------------------------------

create table public.media_posts (
    id                uuid primary key default uuid_generate_v4(),
    short_code        text unique,
    submitter_user_id uuid not null references public.profiles(id) on delete cascade,
    -- Event this post attaches to. Null for a profile-only post.
    event_id          uuid references public.events(id) on delete cascade,
    -- Reserved for Phase 2 (attach a clip to a specific match). No FK yet:
    -- match identity is split across bracket_matches / league schedule rows.
    match_id          uuid,
    kind              text not null check (kind in ('live_stream', 'match_video', 'clip')),
    provider          text not null
        check (provider in ('youtube', 'twitch', 'instagram', 'tiktok', 'facebook', 'other')),
    external_id       text,
    external_subtype  text
        check (external_subtype in ('video', 'short', 'live', 'channel', 'clip')),
    video_url         text not null,
    title             text not null check (length(title) between 3 and 200),
    description       text not null default '',
    -- Moderation
    status            text not null default 'active'
        check (status in ('active', 'hidden', 'removed')),
    report_count      int not null default 0,
    -- Host curation
    featured          boolean not null default false,
    -- Live-stream lifecycle
    live_started_at   timestamptz,
    live_ended_at     timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    constraint media_posts_video_url_https check (video_url ~* '^https://')
);

create index media_posts_event_kind_idx on public.media_posts (event_id, kind);
create index media_posts_submitter_idx  on public.media_posts (submitter_user_id);
create index media_posts_status_idx     on public.media_posts (status);

-- At most one featured live stream per event.
create unique index media_posts_one_featured_stream
    on public.media_posts (event_id)
    where featured and kind = 'live_stream' and status = 'active';

create table public.media_post_reports (
    id               uuid primary key default uuid_generate_v4(),
    post_id          uuid not null references public.media_posts(id) on delete cascade,
    reporter_user_id uuid not null references public.profiles(id) on delete cascade,
    reason           text,
    created_at       timestamptz not null default now(),
    unique (post_id, reporter_user_id)
);

create index media_post_reports_post_idx on public.media_post_reports (post_id);

-- ---- Short code trigger (mirrors community_listings) -----------------------

create or replace function public.media_posts_assign_short_code()
returns trigger
language plpgsql
as $$
declare
    candidate text;
    attempts  int := 0;
begin
    if new.short_code is not null then
        return new;
    end if;
    loop
        candidate := public.gen_event_short_code();
        begin
            new.short_code := candidate;
            return new;
        exception when unique_violation then
            attempts := attempts + 1;
            if attempts >= 5 then raise; end if;
        end;
    end loop;
end;
$$;

drop trigger if exists media_posts_assign_short_code on public.media_posts;
create trigger media_posts_assign_short_code
    before insert on public.media_posts
    for each row execute function public.media_posts_assign_short_code();

-- ---- updated_at maintenance -----------------------------------------------

create or replace function public.media_posts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists media_posts_touch_updated_at on public.media_posts;
create trigger media_posts_touch_updated_at
    before update on public.media_posts
    for each row execute function public.media_posts_touch_updated_at();

-- ---- Auto-hide on report threshold ----------------------------------------
-- SECURITY DEFINER so the count update fires regardless of who filed the
-- report. Reports are inserted on the *user-scoped* client (RLS enforces "real
-- user, one per post"); without DEFINER the reporter's RLS would filter the
-- UPDATE on someone else's post and the counter would never move. (This is the
-- one place media diverges from the community_listings version, which counts on
-- the admin client.)

create or replace function public.media_posts_after_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.media_posts
        set report_count = report_count + 1,
            status = case
                when status = 'active' and report_count + 1 >= 3 then 'hidden'
                else status
            end,
            featured = case
                when status = 'active' and report_count + 1 >= 3 then false
                else featured
            end
        where id = new.post_id;
    return new;
end;
$$;

drop trigger if exists media_post_reports_after_insert on public.media_post_reports;
create trigger media_post_reports_after_insert
    after insert on public.media_post_reports
    for each row execute function public.media_posts_after_report();

-- ---- Host-gated featured-stream RPC ---------------------------------------
-- Cross-row write (clear other featured streams, then set the target) that the
-- partial unique index would otherwise make a two-statement race. Gated on
-- `is_event_host` (AGENTS.md gotcha #8) — mirrors record_bracket_match_result.

create or replace function public.feature_event_stream(p_event_id uuid, p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_event_host(p_event_id) then
        raise exception 'Not authorized to feature streams for this event'
            using errcode = '42501';
    end if;

    update public.media_posts
        set featured = false
        where event_id = p_event_id and featured and id <> p_media_id;

    update public.media_posts
        set featured = true
        where id = p_media_id
          and event_id = p_event_id
          and kind = 'live_stream'
          and status = 'active';

    if not found then
        raise exception 'Stream not found or not eligible to feature'
            using errcode = 'P0002';
    end if;
end;
$$;

grant execute on function public.feature_event_stream(uuid, uuid) to authenticated;

-- ---- RLS ------------------------------------------------------------------

alter table public.media_posts        enable row level security;
alter table public.media_post_reports enable row level security;

-- SELECT: active posts are public; submitter, event host, and admins see all.
create policy "media_posts_select" on public.media_posts
    for select
    using (
        status = 'active'
        or submitter_user_id = auth.uid()
        or public.is_event_host(event_id)
        or public.is_platform_admin()
    );

-- INSERT: authenticated non-anonymous user posting as themselves.
create policy "media_posts_insert" on public.media_posts
    for insert
    with check (
        auth.uid() is not null
        and submitter_user_id = auth.uid()
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    );

-- UPDATE / DELETE: submitter, event host, or platform admin.
create policy "media_posts_update" on public.media_posts
    for update
    using (
        submitter_user_id = auth.uid()
        or public.is_event_host(event_id)
        or public.is_platform_admin()
    )
    with check (
        submitter_user_id = auth.uid()
        or public.is_event_host(event_id)
        or public.is_platform_admin()
    );

create policy "media_posts_delete" on public.media_posts
    for delete
    using (
        submitter_user_id = auth.uid()
        or public.is_event_host(event_id)
        or public.is_platform_admin()
    );

-- Reports: any authenticated non-anon user can file one (unique per post).
create policy "media_post_reports_select" on public.media_post_reports
    for select
    using (
        reporter_user_id = auth.uid()
        or public.is_platform_admin()
    );

create policy "media_post_reports_insert" on public.media_post_reports
    for insert
    with check (
        auth.uid() is not null
        and reporter_user_id = auth.uid()
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    );

create policy "media_post_reports_delete" on public.media_post_reports
    for delete
    using (
        reporter_user_id = auth.uid()
        or public.is_platform_admin()
    );
