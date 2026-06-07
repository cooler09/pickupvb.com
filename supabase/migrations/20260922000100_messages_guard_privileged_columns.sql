-- ============================================================================
-- Pin the privileged columns on public.messages — security audit P2 #16.
--
-- Context: `messages_update` (20260824000000) gates UPDATE on
-- `sender_id = auth.uid() OR can_moderate_conversation(conversation_id)` but,
-- like the media_posts policy, doesn't restrict WHICH columns change — and its
-- WITH CHECK (unlike messages_insert) never re-asserts
-- `can_access_conversation`. Postgres RLS WITH CHECK can't see the OLD row, so a
-- sender can PATCH their own message directly via PostgREST to:
--   * move it to a conversation they can't access (`conversation_id` change) —
--     the broadcast_message trigger then fans it out live to that room
--     (cross-room message injection from a non-member), or
--   * clear `deleted_at` to resurrect a message a moderator soft-deleted.
-- The application layer (SupabaseMessageRepository.update writes only
-- body/edited_at/deleted_at) is already well-behaved; this is the missing
-- DB-level enforcement for direct-API callers.
--
-- Impact: adds one BEFORE UPDATE trigger function + trigger. No schema/column
-- change, no generated-types change. Enforcement only — every legitimate write
-- still passes:
--   * Sender editing body            → body/edited_at change; deleted_at null->null.
--   * Sender/moderator soft-delete    → deleted_at null->timestamp (a SET, allowed).
--   * `messages_after_report` (SECURITY DEFINER) bumps report_count and sets the
--     5-report tombstone — it runs as the function owner ('postgres'), not the
--     API role, so the `current_user` bypass lets it through.
-- What's now rejected for a direct (anon/authenticated) write: changing
-- `conversation_id` or `sender_id` (both immutable post-insert), clearing
-- `deleted_at` (soft-delete is one-way), or editing `report_count`.
--
-- SECURITY INVOKER (default — deliberately NOT definer) so `current_user`
-- reflects the issuing role: 'authenticated'/'anon' for a direct call, the
-- owning role inside a SECURITY DEFINER function, 'service_role' for the admin
-- client.
-- ============================================================================

create or replace function public.messages_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Trusted writers (service_role, and SECURITY DEFINER paths such as
  -- messages_after_report) run as a non-API role and may maintain the
  -- report counter / tombstone.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- Direct API writes (sender edit/soft-delete, moderator soft-delete) only ever
  -- touch body / edited_at and SET deleted_at. The structural identity columns
  -- are immutable, soft-delete is one-way, and report_count is trigger-owned.
  if new.conversation_id is distinct from old.conversation_id then
    raise exception 'A message cannot be moved between conversations'
      using errcode = '42501';
  end if;

  if new.sender_id is distinct from old.sender_id then
    raise exception 'A message sender cannot be changed'
      using errcode = '42501';
  end if;

  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'A deleted message cannot be restored'
      using errcode = '42501';
  end if;

  if new.report_count is distinct from old.report_count then
    raise exception 'report_count is maintained by the moderation trigger, not direct writes'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_guard_privileged on public.messages;
create trigger messages_guard_privileged
  before update on public.messages
  for each row execute function public.messages_guard_privileged_columns();
