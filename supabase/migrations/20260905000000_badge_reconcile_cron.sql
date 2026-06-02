-- ============================================================================
-- Gamification — schedule the badge reconcile cron (pg_cron + pg_net).
-- See docs/adr/0031-gamification-badges.md
--
-- Context: badges are granted on the owner viewing their own profile, but a
-- player who earns one (attended a finished event, won a division) won't see it
-- until they next open their profile. This periodic job calls the
-- `/api/badges/reconcile` route (which loops recently-active players through the
-- idempotent reconcile use-case) so badges land without that visit. Modeled on
-- the notification worker kick (20260822000000): pg_net HTTP from Postgres, URL
-- + bearer secret from Vault, inert until secrets are seeded.
--
-- Impact: additive. New SECURITY DEFINER function `public.kick_badge_reconcile()`
-- and one pg_cron job (every 30 min). No table/RLS/type changes. INERT on any
-- environment without the `badge_reconcile_url` Vault secret — local/preview do
-- nothing, and reconcile-on-profile-view still works there.
--
-- Out-of-band activation (NOT in this migration — secrets are per-env data).
-- Run once per Supabase project that should run the cron:
--   select vault.create_secret(
--     'https://dev.pickupvb.com/api/badges/reconcile', 'badge_reconcile_url');
--   -- reuses the notif worker's cron secret if already seeded; otherwise:
--   select vault.create_secret('<CRON_SECRET for that env>', 'notif_worker_cron_secret');
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Fire-and-forget GET to the reconcile route with the CRON_SECRET bearer the
-- route already checks. SECURITY DEFINER so the owner's grant reads Vault.
-- Cross-schema calls (net.*, vault.*) are fully qualified.
create or replace function public.kick_badge_reconcile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets
   where name = 'badge_reconcile_url'
   limit 1;
  -- Inert until the URL secret is seeded (local/unseeded preview → no-op).
  if v_url is null then
    return;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'notif_worker_cron_secret'
   limit 1;

  perform net.http_get(
    url     := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || coalesce(v_secret, ''))
  );
exception
  when others then
    -- Best-effort: a failed kick must never error the cron run. Next tick retries.
    return;
end;
$$;

revoke all on function public.kick_badge_reconcile() from public;

-- Every 30 minutes. Re-scheduling with the same job name is idempotent
-- (pg_cron upserts by jobname).
select cron.schedule(
  'badge_reconcile',
  '*/30 * * * *',
  $$ select public.kick_badge_reconcile() $$
);
