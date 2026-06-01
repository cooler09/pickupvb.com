-- ============================================================================
-- Account deletion requests — the application path for GDPR Art. 17 erasure.
-- See docs/adr/0029-account-deletion.md, docs/audits/privacy.md (P1 #2 follow-up).
--
-- Context: the DB groundwork for deletion shipped in Bundle 89 (profiles.deleted_at
-- + the FK SET NULL / CASCADE flips), but there was no way for a user to actually
-- request deletion. This adds the request ledger that drives a streamlined,
-- grace-windowed flow: an authenticated user arms deletion -> a `scheduled` row is
-- written with `scheduled_for = now() + 30 days` -> a daily cron
-- (/api/account/execute-deletions) purges due rows -> the user may cancel any time
-- in the window. State machine: scheduled -> executed | cancelled. There is no
-- email-confirm gate (the requester is already authenticated); the grace window +
-- cancel + the notice email are the safety guardrails.
--
-- Impact: one new table `deletion_requests` (run `gen:types` after). Additive only
-- — no existing reads/writes change. RLS lets a user manage only their own rows
-- (mirrors push_subscriptions); the cron flips status to `executed` on the
-- admin/service-role client (bypasses RLS). A partial unique index enforces at most
-- one live (`scheduled`) request per user. Terminal rows are retained as an audit
-- trail — there is deliberately no DELETE policy.
--
-- `user_id` is `ON DELETE SET NULL` (not CASCADE): the execute step transitions the
-- row to `executed`, then hard-deletes the auth user, which cascades through
-- `profiles` (profiles.id -> auth.users is CASCADE). SET NULL lets the `executed`
-- row survive that cascade as an anonymized proof-of-erasure record (status +
-- timestamps, no identifier). The partial unique index only constrains `scheduled`
-- rows, which always carry a non-null user_id.
-- ============================================================================

create table public.deletion_requests (
    id            uuid primary key default uuid_generate_v4(),
    user_id       uuid references public.profiles(id) on delete set null,
    status        text not null default 'scheduled'
                    check (status in ('scheduled', 'executed', 'cancelled')),
    reason        text,
    requested_at  timestamptz not null default now(),
    -- now() + grace window; the cron purges once this passes.
    scheduled_for timestamptz not null,
    -- Stamped when the row leaves `scheduled` (executed or cancelled).
    resolved_at   timestamptz
);

-- At most one live request per user; a cancelled/executed row never blocks a
-- fresh arming.
create unique index deletion_requests_active_uq
    on public.deletion_requests (user_id)
    where status = 'scheduled';

-- The cron scans by (status, scheduled_for).
create index deletion_requests_due_idx
    on public.deletion_requests (scheduled_for)
    where status = 'scheduled';

alter table public.deletion_requests enable row level security;

-- A user reads / arms / cancels only their own rows. No DELETE policy — terminal
-- rows are an audit trail; the cron transitions scheduled -> executed on the
-- service-role client, which bypasses RLS. (The cancel UPDATE leaves user_id
-- unchanged, so the after-image still satisfies the SELECT-as-implicit-WITH-CHECK
-- predicate — none of the deleted_at-style gotcha from the data-lifecycle audit.)
create policy deletion_requests_select on public.deletion_requests
    for select
    using (auth.uid() = user_id);

create policy deletion_requests_insert on public.deletion_requests
    for insert
    with check (auth.uid() = user_id);

create policy deletion_requests_update on public.deletion_requests
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
