-- ============================================================================
-- Debounce the notification worker kick — coalesce cross-user broadcast bursts.
-- See docs/adr/0026-event-driven-notification-delivery.md
--
-- Context: the AFTER INSERT kick from 20260822000000 fires once per INSERT
-- statement. That collapses a single multi-row insert, but a host broadcast
-- loops notify() once per recipient (apps/web/src/app/events/[id]/broadcast-actions.ts)
-- → N separate inserts → N kicks for an N-recipient broadcast. This adds a
-- single-row debounce so a burst within the window fires ~one kick instead of N.
-- It is safe to drop the extra kicks ONLY because the worker now drains the
-- whole backlog per wake (DRAIN_BUDGET_MS loop in the worker route) — one kick
-- delivers the entire burst; the sweep cron backstops any tail enqueued after a
-- burst's final kick.
--
-- Impact: additive. New `notification_worker_kick` (one row, service-role only)
-- and a `create or replace` of `kick_notification_worker()` that gates the HTTP
-- call on the debounce. No table/column changes to notification_outbox; the
-- trigger object itself is unchanged (still statement-level AFTER INSERT). Still
-- inert until Vault is seeded (the URL check remains). Generated types
-- unaffected (the new table is service-role only and never read by app code).
-- ============================================================================

-- Single-row debounce state. `last_kicked_at` is the last time a kick was
-- actually attempted; the trigger advances it under a row lock so exactly one
-- insert in a burst wins the window.
create table public.notification_worker_kick (
  id             smallint primary key default 1 check (id = 1),
  last_kicked_at timestamptz not null default 'epoch'
);

insert into public.notification_worker_kick (id) values (1)
  on conflict (id) do nothing;

-- Service-role only, like notification_outbox. No policies on purpose — only the
-- trigger (SECURITY DEFINER) and the worker touch this.
alter table public.notification_worker_kick enable row level security;

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
  -- Debounce: at most one kick per ~10s window. The conditional UPDATE takes a
  -- row lock on id=1, so exactly one insert in a burst flips last_kicked_at and
  -- proceeds; concurrent / subsequent inserts re-read the fresh timestamp,
  -- update 0 rows, and skip. Cross-user broadcast (N inserts → N statements)
  -- thus collapses to ~one kick. Safe because the worker drains the entire
  -- backlog per wake; the sweep cron backstops any tail after the final kick.
  update public.notification_worker_kick
     set last_kicked_at = now()
   where id = 1
     and last_kicked_at < now() - interval '10 seconds';
  if not found then
    return null;
  end if;

  -- Per-environment config from Vault. Absent on local/unseeded preview →
  -- no-op (inert until seeded; the sweep cron still drains the outbox).
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

  -- Fire-and-forget: pg_net queues the request; the result lands in
  -- net._http_response. We discard the request id.
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
