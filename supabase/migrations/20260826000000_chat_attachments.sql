-- ============================================================================
-- Chat image attachments — enable the reserved `messages.attachments` column
-- and add a private storage bucket for the files (ADR 0028, Phase 4).
-- See docs/adr/0028-chat-messaging.md
--
-- Context: Phase 0 (20260824000000) shipped `messages.attachments jsonb` pinned
-- empty by the `messages_text_only` CHECK, reserving it for this fast-follow.
-- This migration drops that one CHECK (the `messages_nonempty` CHECK already
-- allows body-OR-attachment, so attachment-only messages become valid) and
-- creates the `chat-attachments` bucket. Unlike the public `hero-images` /
-- `sponsor-logos` buckets, this one is PRIVATE: chat — especially DMs — must not
-- be world-readable by URL. Storage RLS gates read/write by the SAME
-- `can_access_conversation` helper the message policies use, keyed off the first
-- path segment. The app reads via short-lived signed URLs minted by members.
--
-- Path convention: `{conversation_id}/{user_id}/{uuid}.{ext}` — segment [1] is
-- the conversation (access gate), segment [2] is the uploader (write/delete
-- gate). Each attachments element is { bucket, path, width, height, mime, size }.
--
-- Impact: `messages` can now carry attachments (run `gen:types` after — the
-- column type is unchanged, but regenerate for completeness). New private bucket
-- + three storage.objects policies. No existing reads/writes change; text-only
-- messages keep working unchanged.
-- ============================================================================

-- Enable attachments: drop the Phase-0 pin. `messages_nonempty` still guarantees
-- a message carries content (body or >= 1 attachment).
alter table public.messages drop constraint if exists messages_text_only;

-- Private bucket (public = false): files are only reachable via signed URLs that
-- a conversation member mints. 10 MB cap, image MIME types only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'chat-attachments',
    'chat-attachments',
    false,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Read: a conversation member may read (and thus sign URLs for) its attachments.
-- Segment [1] of the object path is the conversation id.
drop policy if exists "chat attachments read members" on storage.objects;
create policy "chat attachments read members"
    on storage.objects for select
    to authenticated
    using (
        bucket_id = 'chat-attachments'
        and public.can_access_conversation(((storage.foldername(name))[1])::uuid)
    );

-- Upload: a non-anonymous member may upload, and only under their own user-id
-- segment ([2]) within a conversation they can access ([1]).
drop policy if exists "chat attachments upload members" on storage.objects;
create policy "chat attachments upload members"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'chat-attachments'
        and (storage.foldername(name))[2] = (select auth.uid())::text
        and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
        and public.can_access_conversation(((storage.foldername(name))[1])::uuid)
    );

-- Delete: the uploader may remove their own objects (orphan cleanup is a
-- follow-up cron, mirroring hero-images).
drop policy if exists "chat attachments delete uploader" on storage.objects;
create policy "chat attachments delete uploader"
    on storage.objects for delete
    to authenticated
    using (
        bucket_id = 'chat-attachments'
        and (storage.foldername(name))[2] = (select auth.uid())::text
    );
