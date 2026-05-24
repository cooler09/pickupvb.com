-- ============================================================================
-- Public numbers: aggregate views backing the /about/numbers marketing page
-- and the host-self dashboard.
--
-- Context: docs/audits/analytics.md P2 #7 — sponsorship and press
-- conversations open with "what are your numbers?" and we had no
-- aggregate surface to answer that. PostHog dashboards are great for
-- internal funnels but a public marketing page needs values that can
-- survive a Twitter link without leaking PII or hammering the live
-- tables on every request.
--
-- Impact: additive — two read-only views. `metro_health_weekly`
-- aggregates over published public events (city × week) and is grantable
-- to anon for the public page. `host_activity_monthly` filters to
-- `auth.uid() = host_id` so each authenticated host sees only their own
-- months — grant to authenticated only. Both views use
-- `security_invoker = on` so they inherit the underlying tables' RLS
-- and never elevate. GMV is summed across the three payment sources we
-- already collect: paid open-play attendees (`event_attendees`), paid
-- team payments (`event_team_payments`), and paid tips (`event_tips`).
-- Capacity / fill-rate reads from the primary `event_divisions` row
-- (sort_order = 0) since `events.capacity_kind` / `events.max_spots`
-- were dropped in 20260605000500_phase_9d_drop_legacy_events_cols.sql.
-- `position_demand_weekly` from the audit is deferred — the schema
-- doesn't yet track "position requested for this event," so the
-- supply/demand sides can't be joined meaningfully today.
-- ============================================================================

create or replace view public.metro_health_weekly
with (security_invoker = on) as
with event_rollup as (
    select
        e.id as event_id,
        e.city,
        date_trunc('week', e.starts_at) as week_start,
        coalesce(
            (
                select sum(amount_paid_cents)
                from public.event_attendees
                where event_id = e.id and payment_status = 'paid'
            ),
            0
        )
        + coalesce(
            (
                select sum(amount_paid_cents)
                from public.event_team_payments
                where event_id = e.id and payment_status = 'paid'
            ),
            0
        )
        + coalesce(
            (
                select sum(amount_cents)
                from public.event_tips
                where event_id = e.id and status = 'paid'
            ),
            0
        ) as gmv_cents,
        (
            select count(*) from public.event_attendees where event_id = e.id
        )
        + (
            select count(*) from public.event_teams where event_id = e.id
        ) as attendees_count,
        case
            when
                (
                    select capacity_kind from public.event_divisions
                    where event_id = e.id and sort_order = 0
                ) = 'fixed'
                and (
                    select max_spots from public.event_divisions
                    where event_id = e.id and sort_order = 0
                ) > 0
            then
                (
                    select count(*)::numeric
                    from public.event_attendees
                    where event_id = e.id and payment_status in ('none', 'paid')
                )
                / (
                    select max_spots::numeric from public.event_divisions
                    where event_id = e.id and sort_order = 0
                )
            else null
        end as fill_rate
    from public.events e
    where e.status = 'published' and e.visibility = 'public'
)
select
    city as metro,
    week_start,
    count(*)::int as events_count,
    sum(attendees_count)::int as attendees_count,
    sum(gmv_cents)::bigint as gmv_cents,
    avg(fill_rate) filter (where fill_rate is not null) as avg_fill_rate
from event_rollup
group by city, week_start;

comment on view public.metro_health_weekly is
    'Weekly per-city totals over published public events. Safe to expose to anon for marketing surfaces.';

grant select on public.metro_health_weekly to anon, authenticated;

-- Host self-dashboard: same shape per host per month, gated to the
-- caller via auth.uid().
create or replace view public.host_activity_monthly
with (security_invoker = on) as
select
    e.host_id,
    date_trunc('month', e.starts_at) as month_start,
    count(*)::int as events_count,
    coalesce(
        sum(
            coalesce(
                (
                    select sum(amount_paid_cents)
                    from public.event_attendees
                    where event_id = e.id and payment_status = 'paid'
                ),
                0
            )
            + coalesce(
                (
                    select sum(amount_paid_cents)
                    from public.event_team_payments
                    where event_id = e.id and payment_status = 'paid'
                ),
                0
            )
            + coalesce(
                (
                    select sum(amount_cents)
                    from public.event_tips
                    where event_id = e.id and status = 'paid'
                ),
                0
            )
        ),
        0
    )::bigint as gmv_cents,
    avg(
        case
            when
                (
                    select capacity_kind from public.event_divisions
                    where event_id = e.id and sort_order = 0
                ) = 'fixed'
                and (
                    select max_spots from public.event_divisions
                    where event_id = e.id and sort_order = 0
                ) > 0
            then
                (
                    select count(*)::numeric
                    from public.event_attendees
                    where event_id = e.id and payment_status in ('none', 'paid')
                )
                / (
                    select max_spots::numeric from public.event_divisions
                    where event_id = e.id and sort_order = 0
                )
            else null
        end
    ) as avg_fill_rate
from public.events e
where e.status = 'published'
  and e.host_id = auth.uid()
group by e.host_id, date_trunc('month', e.starts_at);

comment on view public.host_activity_monthly is
    'Monthly per-host totals. Filtered to auth.uid() inside the view so each caller sees only their own rows.';

grant select on public.host_activity_monthly to authenticated;
