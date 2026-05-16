-- ============================================================================
-- Phase 4: Tip jar
--
-- Per-event tipping. Independent of ticket purchases — works for both free
-- and paid events. A tip goes through Stripe Checkout (mode=payment) with a
-- destination charge to the host's connected account, just like a ticket.
--
-- Platform fee follows the same rule as tickets: 2.5% for Pro hosts, 5%
-- otherwise. Computed at server-action time and passed as
-- application_fee_amount; the actual rate is stored on the row for audit.
--
-- Tips are never required to attend an event. There's no row in
-- event_attendees for a tipper-only interaction. If the same user is also an
-- attendee, the tip row stands on its own.
-- ============================================================================

create table public.event_tips (
    id uuid primary key default gen_random_uuid (),
    event_id uuid not null references public.events (id) on delete cascade,
    -- denormalized so we can compute host tip totals without a join
    host_id uuid not null references auth.users (id) on delete cascade,
    -- nullable: anonymous-auth users have a user_id; truly anonymous (no
    -- session at all) shouldn't happen because the action mints an anon
    -- auth user before redirecting, but allow null defensively.
    tipper_user_id uuid references auth.users (id) on delete set null,
    -- display name captured at tip time (anon users provide one via the
    -- guest form; auth users get their profile display_name copied in).
    tipper_display_name text,
    amount_cents integer not null check (amount_cents >= 100 and amount_cents <= 50000),
    platform_fee_cents integer not null default 0,
    message text check (message is null or char_length(message) <= 280),
    stripe_session_id text unique,
    stripe_payment_intent_id text unique,
    status text not null default 'pending' check (
        status in ('pending', 'paid', 'failed', 'refunded')
    ),
    created_at timestamptz not null default now(),
    paid_at timestamptz,
    refunded_at timestamptz
);

create index event_tips_event_id_idx on public.event_tips (event_id);
create index event_tips_host_id_idx on public.event_tips (host_id);
create index event_tips_status_idx on public.event_tips (status);

alter table public.event_tips enable row level security;

-- Anyone (including anon) can see paid tips on an event, but only the host
-- sees pending/failed/refunded and the tipper identity for non-paid rows.
-- Simpler: public read of just paid rows; everything else is service-role.
create policy "event_tips_public_read_paid" on public.event_tips for
select
    to authenticated, anon using (status = 'paid');

-- Hosts (and event co-hosts via the existing helper) can see all of their
-- event's tips for management/refunds.
create policy "event_tips_host_read_all" on public.event_tips for
select
    to authenticated using (
        host_id = (
            select
                auth.uid ()
        )
    );

-- All writes go through the webhook (service-role); no insert/update
-- policies for authenticated users.

-- Helper: total paid tips for an event in cents.
create
or replace function public.event_tip_total_cents (p_event_id uuid) returns integer language sql stable security definer
set
    search_path = public as $$
    select coalesce(sum(amount_cents), 0)::int
    from event_tips
    where event_id = p_event_id and status = 'paid'
$$;

grant
execute on function public.event_tip_total_cents (uuid) to anon,
authenticated;
