-- ============================================================================
-- Event-driven notification delivery — DB "kick" trigger on notification_outbox.
-- See docs/adr/0026-event-driven-notification-delivery.md
--
-- Context: the outbox worker (/api/notifications/worker) was woken only by a
-- fixed-interval Vercel cron — every minute, firing into a mostly-empty queue
-- and booking ~43k function invocations/month as Vercel observability events.
-- This adds an AFTER INSERT trigger that "kicks" the worker the moment a row is
-- enqueued, so fresh notifications deliver in seconds and the sweep cron can run
-- far less often. Retries stay time-based (claimBatch gates on
-- scheduled_for <= now(); markFailed reschedules into the future), so the cron
-- sweep is retained as the backstop — this is a hybrid, not a cron replacement.
--
-- Impact: additive. New `pg_net` extension (first HTTP-from-Postgres use here),
-- one SECURITY DEFINER trigger function, one statement-level AFTER INSERT trigger
-- on public.notification_outbox. No table/column/RLS changes — generated types
-- are unaffected. The trigger is INERT until Vault secrets are seeded (see
-- below): with no `notif_worker_url` secret it returns early and does nothing,
-- so this migration is safe to deploy ahead of secret seeding and harmless on
-- local/preview. The worker route already authorizes via CRON_SECRET, so no
-- app-layer change ships with this migration. The `*/5` sweep cron stays as-is
-- until the kick is verified on dev (then drops to `*/15` — see the ADR).
--
-- Out-of-band activation (NOT in this migration — secrets are data, per-env, and
-- must not be committed). Run once per Supabase project:
--   select vault.create_secret(
--     'https://dev.pickupvb.com/api/notifications/worker', 'notif_worker_url');
--   select vault.create_secret('<CRON_SECRET for that env>', 'notif_worker_cron_secret');
-- (prod URL + secret on prod; seed nothing on local to keep the kick inert.)
-- ============================================================================

create extension if not exists pg_net;

-- Kick the outbox worker when rows are enqueued. Fire-and-forget GET to the
-- worker URL with the CRON_SECRET bearer header the route already checks.
--
-- SECURITY DEFINER so it can read vault.decrypted_secrets (the enqueue runs on
-- the service-role client, but the function owner's grant is what reads Vault).
-- Cross-schema calls (net.*, vault.*) are fully qualified, so search_path only
-- needs public.
create or replace function public.kick_notification_worker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  -- Per-environment config from Vault. Absent on local/unseeded preview →
  -- no-op (the sweep cron / manual GET still drains the outbox). This early
  -- return is what makes the trigger inert until secrets are seeded.
  select decrypted_secret into v_url
    from vault.decrypted_secrets
   where name = 'notif_worker_url'
   limit 1;
  if v_url is null then
    return null;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'notif_worker_cron_secret'
   limit 1;

  -- Fire-and-forget: pg_net queues the request and writes the result to
  -- net._http_response. We discard the request id. Statement-level trigger →
  -- one kick per INSERT statement (a bulk insert([...]) fires a single call).
  perform net.http_get(
    url     := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(v_secret, '')
    )
  );

  return null;
exception
  when others then
    -- Best-effort: a kick failure must never roll back the enqueue. The sweep
    -- cron is the backstop, so swallow and let the row deliver on the next sweep.
    return null;
end;
$$;

drop trigger if exists trg_kick_notification_worker on public.notification_outbox;

create trigger trg_kick_notification_worker
  after insert on public.notification_outbox
  for each statement
  execute function public.kick_notification_worker();
