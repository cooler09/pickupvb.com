-- ============================================================================
-- Chat retention — sweep orphaned attachment objects + scrub soft-deleted
-- message content. Closes privacy.md #14 (P2) and the chat slice of
-- data-lifecycle.md §1 (Messaging). See docs/audits/privacy.md #14.
--
-- Context: chat shipped (20260824000000 messaging, 20260826000000 attachments)
-- with two retention gaps the 2026-05-31 privacy re-audit logged as #14:
--   1. Objects in the private `chat-attachments` bucket have no orphan sweep —
--      the attachments migration explicitly deferred it ("a follow-up cron,
--      mirroring hero-images"). An object is uploaded under
--      `{conversation_id}/{user_id}/{uuid}.{ext}` and its bare path stored in
--      `messages.attachments[].path`; nothing reclaims it when the message is
--      removed/scrubbed or the upload is abandoned before send.
--   2. Soft-deleted messages keep `body` + `attachments` on disk forever.
--      `messages_update` only sets `deleted_at`; the read path already
--      tombstones (rowToView returns body:'' / attachments:[] for deleted rows
--      — packages/infrastructure/src/supabase-messaging-repository.ts), so the
--      content is already invisible to every reader, but it lingers in the
--      table readable by a platform admin / a future raw export. Same
--      unbounded-PII concern that elevated notification_outbox to P1, scoped
--      to chat (higher-sensitivity free text, lower volume).
--
-- Unlike hero-images / sponsor-logos (which persist a full PUBLIC url with a
-- `?t=<ms>` cache-buster, forcing a LIKE-with-wildcard liveness match — see
-- 20260819000000), chat attachments are PRIVATE: the row stores the BARE object
-- path (no url, no cache-buster — conversation-view.tsx builds it as
-- `${conversationId}/${viewerId}/${uuid}.${ext}`), so liveness here is an exact
-- `storage.objects.name = messages.attachments[].path` membership test.
--
-- Impact: additive + one CHECK relaxation.
--   * `messages_nonempty` now also passes when `deleted_at is not null`, so the
--     scrub can blank a tombstoned row's body/attachments without tripping the
--     "a message must carry content" invariant. Live inserts are unchanged —
--     sendChatMessage already rejects empty body + no-attachment before insert,
--     so only the scrub job below ever produces an empty row (always deleted).
--   * New SECURITY DEFINER walker `public.purge_chat_attachment_orphans(grace)`
--     + a daily 06:45 UTC cron.
--   * New `messages_scrub_soft_deleted_30d` cron (06:30 UTC) nulls body +
--     attachments on rows soft-deleted > 30 days ago. The scrub UPDATE fires
--     the existing broadcast_message AFTER-UPDATE trigger, re-emitting a
--     (still-tombstoned) UPDATE to the `chat:{id}` topic once per row — a
--     subscriber would just re-render the same empty tombstone. Harmless churn,
--     accepted; the WHERE guard skips already-scrubbed rows so it fires at most
--     once per message and the job stays idempotent.
--   * Ordering: the scrub (06:30) de-references attachments on aged tombstones,
--     then the orphan sweep (06:45) reclaims the now-unreferenced objects the
--     same night. Both clear of the 04:00–05:00 retention purges and the
--     06:00/06:15 hero/sponsor/push sweeps.
-- No schema/type changes beyond the CHECK — `gen:types` output is unaffected.
-- ============================================================================

create extension if not exists pg_cron;

-- ---- (#14 sub-gap 2) allow a soft-deleted message to be emptied -------------
-- The "a message must carry content" invariant should only bind LIVE rows; a
-- tombstone is allowed to be empty so the scrub below can strip its PII while
-- keeping the row (the conversation's tombstone placeholder survives).
alter table public.messages drop constraint if exists messages_nonempty;
alter table public.messages add constraint messages_nonempty check (
    deleted_at is not null
    or length(btrim(body)) > 0
    or jsonb_array_length(attachments) > 0
);

-- ---- (#14 sub-gap 1) chat-attachments orphan walker -------------------------
-- Liveness: the object's path appears as a `path` in SOME messages.attachments
-- element (any row, deleted or not — the scrub cron is what removes the
-- reference from an aged tombstone, after which the object falls through here
-- as an orphan). The `path is not null` filter avoids the NOT IN NULL gotcha.
--
-- storage.objects has a `protect_delete` BEFORE-DELETE trigger that blocks
-- direct SQL deletion unless the session GUC `storage.allow_delete_query` is
-- 'true'. Setting it inside this SECURITY DEFINER function is the supported
-- server-side-maintenance escape hatch (same as the hero / sponsor walkers);
-- removing the storage.objects row is sufficient (the backend reconciles the
-- blob). search_path is locked to '' for definer hygiene — every relation is
-- schema-qualified; jsonb_*/now()/make_interval/count are pg_catalog builtins.
create or replace function public.purge_chat_attachment_orphans(p_grace_hours int default 24)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  perform set_config('storage.allow_delete_query', 'true', true);

  with referenced as (
    select elem ->> 'path' as path
      from public.messages m
      cross join lateral jsonb_array_elements(m.attachments) as elem
     where jsonb_array_length(m.attachments) > 0
  ),
  cand as (
    select o.name
      from storage.objects o
     where o.bucket_id = 'chat-attachments'
       and o.created_at < now() - make_interval(hours => p_grace_hours)
  ),
  orphans as (
    select c.name
      from cand c
     where c.name not in (select path from referenced where path is not null)
  ),
  deleted as (
    delete from storage.objects o
     using orphans
     where o.bucket_id = 'chat-attachments'
       and o.name = orphans.name
     returning 1
  )
  select count(*) into v_deleted from deleted;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.purge_chat_attachment_orphans(int) from public;
grant execute on function public.purge_chat_attachment_orphans(int) to postgres;

-- Daily orphan sweep. 06:45 UTC — after the message scrub (06:30) so objects
-- de-referenced from aged tombstones are reclaimed the same night.
select cron.schedule(
  'chat_attachments_purge_orphans',
  '45 6 * * *',
  $$ select public.purge_chat_attachment_orphans(24) $$
);

-- ---- (#14 sub-gap 2) scrub aged soft-deleted message content ----------------
-- 30-day window: long enough for moderation review / an accidental-delete
-- complaint, short enough to honour data-minimization on free-text PII. The
-- guard skips already-scrubbed rows so the job is idempotent and doesn't
-- re-broadcast the same tombstone every night. Covers both user self-deletes
-- and the report-threshold auto-hide (messages_after_report) — both set
-- deleted_at, so both age into the scrub.
select cron.schedule(
  'messages_scrub_soft_deleted_30d',
  '30 6 * * *',
  $$ update public.messages
        set body = '', attachments = '[]'::jsonb
      where deleted_at is not null
        and deleted_at < now() - interval '30 days'
        and (length(body) > 0 or jsonb_array_length(attachments) > 0) $$
);
