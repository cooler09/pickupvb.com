-- Community-submitted event listings.
--
-- Listings represent events users want to surface on PickupVB even though
-- the host isn't on the platform (e.g. a Facebook post for a beach pickup
-- night at a local park). Listings are info-only: no RSVPs, no capacity,
-- no payments. The detail page links out to the external source.
--
-- Mirrors /events at a high level but with looser invariants:
--   - All location fields are nullable (we don't require geocoding).
--   - Surface/format/skill_level are nullable (often unknown).
--   - No co-hosts, no attendees.
--
-- See packages/domain/src/community-listings/ for the aggregate.

-- ---- Tables ---------------------------------------------------------------

create table public.community_listings (
    id                   uuid primary key default uuid_generate_v4(),
    short_code           text unique,
    slug                 text unique,
    title                text not null check (length(title) between 3 and 200),
    description          text not null default '',
    external_url         text not null,
    external_host_name   text,
    starts_at            timestamptz not null,
    ends_at              timestamptz,
    -- Optional location (all-or-nothing enforced by check below)
    address_line         text,
    city                 text,
    region               text,
    postal_code          text,
    country              text,
    geo                  geography(point, 4326),
    -- Optional event metadata
    surface              surface,
    format               format,
    skill_level          skill_level,
    -- Submission + moderation
    submitter_user_id    uuid not null references public.profiles(id) on delete cascade,
    status               text not null default 'active'
        check (status in ('active', 'hidden', 'claimed', 'removed')),
    report_count         int not null default 0,
    -- Claim linkage (set when an off-platform host signs up and claims the listing)
    claimed_event_id     uuid references public.events(id) on delete set null,
    claimed_by_user_id   uuid references public.profiles(id) on delete set null,
    claimed_at           timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    -- INVARIANTS
    constraint community_listings_time_order check (ends_at is null or ends_at > starts_at),
    constraint community_listings_location_complete check (
        -- Either all four required text fields are present, or none are.
        (city is not null and country is not null)
        or (city is null and region is null and postal_code is null and country is null and address_line is null and geo is null)
    ),
    constraint community_listings_external_url_https check (external_url ~* '^https://')
);

create index community_listings_geo_idx        on public.community_listings using gist (geo);
create index community_listings_starts_at_idx  on public.community_listings (starts_at);
create index community_listings_status_idx     on public.community_listings (status);
create index community_listings_submitter_idx  on public.community_listings (submitter_user_id);

create table public.community_listing_reports (
    id              uuid primary key default uuid_generate_v4(),
    listing_id      uuid not null references public.community_listings(id) on delete cascade,
    reporter_user_id uuid not null references public.profiles(id) on delete cascade,
    reason          text,
    created_at      timestamptz not null default now(),
    unique (listing_id, reporter_user_id)
);

create index community_listing_reports_listing_idx on public.community_listing_reports (listing_id);

-- ---- Slug + short code triggers (mirror events + teams patterns) ----------

create or replace function public.community_listings_assign_short_code()
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

drop trigger if exists community_listings_assign_short_code on public.community_listings;
create trigger community_listings_assign_short_code
    before insert on public.community_listings
    for each row execute function public.community_listings_assign_short_code();

create or replace function public.community_listings_assign_slug()
returns trigger
language plpgsql
as $$
declare
    base      text;
    candidate text;
    tries     int := 0;
begin
    if new.slug is not null and length(new.slug) > 0 then
        return new;
    end if;
    base := nullif(public.slugify(new.title), '');
    if base is null then base := 'listing'; end if;
    base := substr(base, 1, 40);
    loop
        candidate := base || '-' || public.gen_short_id(6);
        exit when not exists (select 1 from public.community_listings where slug = candidate);
        tries := tries + 1;
        if tries > 8 then
            candidate := base || '-' || public.gen_short_id(10);
            exit;
        end if;
    end loop;
    new.slug := candidate;
    return new;
end;
$$;

drop trigger if exists community_listings_assign_slug on public.community_listings;
create trigger community_listings_assign_slug
    before insert on public.community_listings
    for each row execute function public.community_listings_assign_slug();

-- ---- updated_at maintenance ----------------------------------------------

create or replace function public.community_listings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists community_listings_touch_updated_at on public.community_listings;
create trigger community_listings_touch_updated_at
    before update on public.community_listings
    for each row execute function public.community_listings_touch_updated_at();

-- ---- Auto-hide on report threshold ---------------------------------------

create or replace function public.community_listings_after_report()
returns trigger
language plpgsql
as $$
begin
    update public.community_listings
        set report_count = report_count + 1,
            status = case
                when status = 'active' and report_count + 1 >= 3 then 'hidden'
                else status
            end
        where id = new.listing_id;
    return new;
end;
$$;

drop trigger if exists community_listing_reports_after_insert on public.community_listing_reports;
create trigger community_listing_reports_after_insert
    after insert on public.community_listing_reports
    for each row execute function public.community_listings_after_report();

-- ---- Backfill (no-op for fresh table, here for symmetry) -----------------

-- (table is new, nothing to backfill)

-- ---- RLS -----------------------------------------------------------------

alter table public.community_listings        enable row level security;
alter table public.community_listing_reports enable row level security;

-- SELECT: active listings are public; submitter and admins see all.
create policy "community_listings_select" on public.community_listings
    for select
    using (
        status = 'active'
        or submitter_user_id = auth.uid()
        or public.is_platform_admin()
    );

-- INSERT: authenticated non-anonymous user can submit their own listing.
-- Anonymous-auth check uses the JWT claim Supabase sets when is_anonymous=true.
create policy "community_listings_insert" on public.community_listings
    for insert
    with check (
        auth.uid() is not null
        and submitter_user_id = auth.uid()
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    );

-- UPDATE: submitter or platform admin.
create policy "community_listings_update" on public.community_listings
    for update
    using (
        submitter_user_id = auth.uid()
        or public.is_platform_admin()
    )
    with check (
        submitter_user_id = auth.uid()
        or public.is_platform_admin()
    );

-- DELETE: submitter or platform admin.
create policy "community_listings_delete" on public.community_listings
    for delete
    using (
        submitter_user_id = auth.uid()
        or public.is_platform_admin()
    );

-- Reports: any authenticated non-anon user can file a report (one per listing).
create policy "community_listing_reports_select" on public.community_listing_reports
    for select
    using (
        reporter_user_id = auth.uid()
        or public.is_platform_admin()
    );

create policy "community_listing_reports_insert" on public.community_listing_reports
    for insert
    with check (
        auth.uid() is not null
        and reporter_user_id = auth.uid()
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    );

-- Reports cannot be edited; they can be deleted by reporter or admin (e.g. retract).
create policy "community_listing_reports_delete" on public.community_listing_reports
    for delete
    using (
        reporter_user_id = auth.uid()
        or public.is_platform_admin()
    );
