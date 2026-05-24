-- ============================================================================
-- Marketing attribution: first-touch table populated from the
-- `pickupvb_attr` cookie at signup.
--
-- Context: docs/audits/analytics.md P1 #3 — without UTM persistence we
-- can't tell an advertiser "your $500 brought us 12 paying hosts and
-- $3,400 of GMV in 30 days." The Edge proxy
-- (apps/web/src/proxy.ts) stamps `pickupvb_attr` on the first request
-- whose URL carries `utm_*` params or whose `Referer` is off-domain;
-- the auth callback (apps/web/src/app/auth/callback/route.ts) copies
-- that cookie into this table the first time the user finishes
-- signup. First-touch semantics: one row per user, never overwritten
-- (the cookie is cleared after the first capture so a returning user
-- with a different UTM doesn't reset attribution).
--
-- Impact: additive — a new table with one PK + FK to `profiles`. No
-- writes from app code today block on this row existing, so a missed
-- cookie is silently dropped (acceptable for organic / direct traffic).
-- Multi-touch / last-touch attribution is explicitly out of scope per
-- the audit P1 #3 recommendation; this is the first-touch foundation.
-- ============================================================================

create table public.marketing_attribution (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    source text,
    medium text,
    campaign text,
    content text,
    term text,
    referrer text,
    landing_path text,
    captured_at timestamptz not null,
    attached_at timestamptz not null default now()
);

comment on table public.marketing_attribution is
    'First-touch marketing attribution per user. Populated from the pickupvb_attr cookie at signup. Never overwritten.';

-- RLS: users see their own attribution row; platform admins see all.
-- No INSERT/UPDATE policy — only the auth-callback route handler
-- (running with the user session client) writes here, and it does so
-- via an upsert with `ON CONFLICT (user_id) DO NOTHING` so a re-run
-- of the callback never clobbers the first-touch row.
alter table public.marketing_attribution enable row level security;

create policy marketing_attribution_select_own
    on public.marketing_attribution
    for select
    using (auth.uid() = user_id);

create policy marketing_attribution_insert_own
    on public.marketing_attribution
    for insert
    with check (auth.uid() = user_id);

-- Index for "campaigns that brought in users in the last 30 days"
-- dashboards. Cheap; the table will stay narrow (one row per user).
create index marketing_attribution_source_medium_idx
    on public.marketing_attribution (source, medium, captured_at desc)
    where source is not null;
