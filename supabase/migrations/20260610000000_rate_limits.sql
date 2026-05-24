-- Rate limiter backing store for email-sending paths (claim flow, guest
-- signup, guest checkout). Audit P2 #6 (docs/audits/security.md) flagged
-- that custom Resend / Supabase Auth emails have no per-IP or per-email
-- throttle, so an attacker could mail-bomb a target by replaying the
-- guest signup or claim forms.
--
-- We deliberately use Postgres rather than provisioning Vercel KV or
-- Upstash for the first milestone: Supabase is already on the critical
-- path, the data volume is tiny (one row per `key`, expired rows
-- collapse on next hit), and a `security definer` SQL function makes the
-- "increment, reset, or deny" sequence atomic without a round-trip.
--
-- If the table ever becomes hot enough that Postgres write contention
-- shows up, swap to a sliding-window KV (Upstash Redis) behind the same
-- helper. The application boundary is `consumeRateLimit()` in
-- apps/web/src/lib/rate-limit.ts; nothing else depends on the table
-- shape.

create table if not exists public.rate_limits (
  key          text primary key,
  count        integer not null,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;

-- No policies: the table is only touched by `consume_rate_limit()` which
-- runs `security definer` (owner = postgres), and by maintenance
-- queries via the service role. Anonymous + authenticated callers see
-- nothing.
comment on table public.rate_limits is
  'Per-key counters for the rate limiter. Locked down — only consume_rate_limit() should write.';

-- Atomic "fixed window" counter: if the existing window is still open,
-- bump the count and return whether we''re under the limit. If the
-- window has expired, reset the row to count=1 and allow. The whole
-- operation runs under a single row lock thanks to
-- `insert ... on conflict do update`, so concurrent callers can''t
-- race past the limit.
create or replace function public.consume_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
) returns table (
  allowed              boolean,
  retry_after_seconds  integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now          timestamptz := now();
  v_window_start timestamptz;
  v_count        integer;
begin
  insert into public.rate_limits (key, count, window_start)
  values (p_key, 1, v_now)
  on conflict (key) do update
    set count        = case
                         when public.rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now
                           then 1
                         else public.rate_limits.count + 1
                       end,
        window_start = case
                         when public.rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now
                           then v_now
                         else public.rate_limits.window_start
                       end
  returning public.rate_limits.count, public.rate_limits.window_start
    into v_count, v_window_start;

  if v_count <= p_limit then
    allowed             := true;
    retry_after_seconds := 0;
  else
    allowed             := false;
    -- Seconds remaining until the current window expires. Ceil so the
    -- caller never under-reports.
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::int
    );
  end if;

  return next;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

comment on function public.consume_rate_limit(text, integer, integer) is
  'Atomic fixed-window rate limiter. Returns (allowed, retry_after_seconds). Service-role only.';
