-- ============================================================================
-- Event-level extensions for real-world tournament listings.
-- See docs/adr/0006-event-divisions.md.
--
-- Adds:
--   * venue_name                — display name beyond the street address
--   * registration_closes_at    — cutoff distinct from starts_at
--   * series_name / position / size — "Grass Masters · Event 2 of 10"
--   * is_fundraiser / fundraiser_beneficiary
--   * theme_tags                — "patriotic", "christmas-in-july", ...
--   * sanctioning_body          — NAGVA, USAV, AVP, ...
--   * registration_mode         — 'platform' (Stripe) | 'external' (DM/Venmo/URL)
--   * external_registration_url / _instructions
--   * payment_instructions      — free-form, e.g. "Venmo @scotthphillips"
--
-- All columns are nullable / safe-defaulted so existing rows and code paths
-- continue to work unchanged. The events_view is rebuilt at the end so the
-- new columns are exposed to the read layer.
-- ============================================================================

create type registration_mode as enum ('platform', 'external');

alter table public.events
  add column if not exists venue_name                       text,
  add column if not exists registration_closes_at           timestamptz,
  add column if not exists series_name                      text,
  add column if not exists series_position                  integer,
  add column if not exists series_size                      integer,
  add column if not exists is_fundraiser                    boolean not null default false,
  add column if not exists fundraiser_beneficiary           text,
  add column if not exists theme_tags                       text[] not null default '{}',
  add column if not exists sanctioning_body                 text,
  add column if not exists registration_mode                registration_mode not null default 'platform',
  add column if not exists external_registration_url        text,
  add column if not exists external_registration_instructions text,
  add column if not exists payment_instructions             text;

-- ---- CHECK constraints (defensive bounds for free-form fields) -------------
alter table public.events
  add constraint events_venue_name_len
    check (venue_name is null or length(venue_name) between 1 and 120),
  add constraint events_series_name_len
    check (series_name is null or length(series_name) between 1 and 120),
  add constraint events_series_position_positive
    check (series_position is null or series_position > 0),
  add constraint events_series_size_positive
    check (series_size is null or series_size > 0),
  add constraint events_series_position_within_size
    check (
      series_position is null
      or series_size is null
      or series_position <= series_size
    ),
  add constraint events_fundraiser_beneficiary_len
    check (
      fundraiser_beneficiary is null
      or length(fundraiser_beneficiary) between 1 and 120
    ),
  add constraint events_sanctioning_body_len
    check (
      sanctioning_body is null
      or length(sanctioning_body) between 1 and 40
    ),
  add constraint events_external_url_len
    check (
      external_registration_url is null
      or length(external_registration_url) between 1 and 500
    ),
  add constraint events_external_instructions_len
    check (
      external_registration_instructions is null
      or length(external_registration_instructions) between 1 and 2000
    ),
  add constraint events_payment_instructions_len
    check (
      payment_instructions is null
      or length(payment_instructions) between 1 and 1000
    ),
  add constraint events_registration_closes_before_start
    check (registration_closes_at is null or registration_closes_at <= ends_at);

-- Registration deadline cannot be in the past relative to event start is
-- intentionally NOT enforced — hosts may legitimately push the cutoff after
-- the event starts (drop-in tournaments).

-- ---- Index for series grouping ---------------------------------------------
create index if not exists events_series_name_idx
  on public.events (series_name)
  where series_name is not null;

-- ---- Rebuild events_view to expose the new columns -------------------------
-- (events_view uses `select e.*` but the column list is frozen at view
-- creation; see 20260518000100_rebuild_events_view.sql.)
--
-- The search_events RPC has an explicit return shape and is NOT extended
-- here — division-aware search comes in the divisions migration.

drop function if exists public.search_events(
  double precision, double precision, double precision,
  text, text, text, text, text,
  timestamptz, timestamptz, int
);

drop view if exists public.events_view;
create view public.events_view as
select
  e.*,
  st_x(e.geo::geometry) as longitude,
  st_y(e.geo::geometry) as latitude,
  (select count(*) from public.event_attendees a where a.event_id = e.id)::int as attendee_count,
  (select count(*) from public.event_teams    t where t.event_id = e.id)::int as team_count
from public.events e;
grant select on public.events_view to anon, authenticated;

-- Recreate search_events with the same signature as the previous migration
-- (20260603000000_event_listing_time_zone.sql) so existing callers continue
-- to work. Division-aware variants come in the divisions migration.
create or replace function public.search_events(
  p_lat           double precision default null,
  p_lng           double precision default null,
  p_radius_km     double precision default null,
  p_surface       text default null,
  p_format        text default null,
  p_gender        text default null,
  p_skill_level   text default null,
  p_type          text default null,
  p_starts_after  timestamptz default null,
  p_starts_before timestamptz default null,
  p_limit         int default 20
)
returns table (
  id              uuid,
  title           text,
  surface         text,
  format          text,
  gender          text,
  skill_level     text,
  type            text,
  status          text,
  visibility      text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  time_zone       text,
  address_line    text,
  city            text,
  region          text,
  postal_code     text,
  country         text,
  latitude        double precision,
  longitude       double precision,
  attendee_count  int,
  team_count      int,
  distance_km     double precision
)
language sql stable as $$
  select
    e.id, e.title,
    e.surface::text, e.format::text, e.gender::text,
    e.skill_level::text, e.type::text, e.status::text, e.visibility::text,
    e.starts_at, e.ends_at, e.time_zone,
    e.address_line, e.city, e.region, e.postal_code, e.country,
    e.latitude, e.longitude,
    e.attendee_count, e.team_count,
    case
      when p_lat is not null and p_lng is not null then
        st_distance(e.geo, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0
      else null
    end as distance_km
  from public.events_view e
  where e.status = 'published'
    and (p_surface     is null or e.surface::text     = p_surface)
    and (p_format      is null or e.format::text      = p_format)
    and (p_gender      is null or e.gender::text      = p_gender)
    and (p_skill_level is null or e.skill_level::text = p_skill_level)
    and (p_type        is null or e.type::text        = p_type)
    and (p_starts_after  is null or e.starts_at >= p_starts_after)
    and (p_starts_before is null or e.starts_at <= p_starts_before)
    and (
      p_lat is null or p_lng is null or p_radius_km is null
      or st_dwithin(
        e.geo,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        p_radius_km * 1000
      )
    )
  order by
    case
      when p_lat is not null and p_lng is not null then
        st_distance(e.geo, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
      else extract(epoch from e.starts_at)
    end
  limit coalesce(p_limit, 20)
$$;
