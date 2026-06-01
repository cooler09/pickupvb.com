# Chat messaging — Phase 4: image attachments (2026-05-31)

## Context

The final chat phase per [ADR 0028](../adr/0028-chat-messaging.md): image
attachments. Phase 0 had already reserved `messages.attachments jsonb`, pinned
empty by a `messages_text_only` CHECK, precisely so this could ship without a
table migration. This bundle drops that CHECK, adds the storage bucket, and
threads attachments through the stack.

## Decisions

- **Private bucket + RLS + signed URLs (not a public bucket).** The repo's
  existing image buckets (`hero-images`, `sponsor-logos`) are public — fine for
  banners, wrong for DMs. A public bucket would make any DM image world-readable
  by URL. So `chat-attachments` is **private**, and storage RLS gates read/write
  by the same `can_access_conversation` helper the message policies use, keyed
  off the object path `{conversation_id}/{user_id}/{uuid}.{ext}` (segment [1] =
  access gate, [2] = uploader gate). The app displays via short-lived signed
  URLs that only a member can mint. This was the user's call when asked; it's
  the choice consistent with the project's RLS-everywhere posture and the
  just-built private DMs.
- **The content rule relaxes, it doesn't disappear.** `Message.compose` now
  accepts attachments and allows an empty body _iff_ there's ≥1 attachment —
  exactly the DB `messages_nonempty` CHECK, kept in the aggregate so the rule is
  unit-tested in one place. Attachment validation (image MIME, size ≤ 10 MB,
  count ≤ 10) lives there too.
- **`findById` now loads attachments.** `edit` validates the new body against the
  message's existing attachments (so editing to an empty caption is legal when an
  image is attached). That only works if the rehydrated aggregate carries its
  attachments — so the repository's `findById` selects the column, not just the
  read path.
- **Upload is client-side in the shared `ConversationView`.** Because Phase 3
  already unified the team room and the DM thread on one component, adding the
  composer's attach button + upload there lit up attachments on **both** surfaces
  at once — the payoff of the Phase-3 extraction. The client uploads to storage,
  reads image dimensions locally, then sends the message with the attachment
  metadata; the optimistic echo + the broadcast both render via `ChatImage`.
- **Plain `<img>` for attachments, not `next/image`.** Signed URLs are ephemeral
  (token + expiry) and per-viewer, so they don't fit Next's static-optimization
  / `remotePatterns` model. `ChatImage` uses a plain `<img>` with a scoped
  `no-img-element` disable + reason.

## Changes

- `supabase/migrations/20260826000000_chat_attachments.sql` — drops
  `messages_text_only`; private `chat-attachments` bucket + 3 storage policies.
- `packages/domain/src/messaging/message.ts` — `MessageAttachment` + caps;
  `compose`/`fromPersistence`/`edit` carry attachments; `assertContent` (body OR
  attachment) replaces `assertBody`. New tests in `message.test.ts`.
- `packages/domain/src/messaging/message-queries.ts` — `MessageAttachmentView` +
  `MessageView.attachments`.
- `packages/application/src/messages.ts` + `message.handler.ts` —
  `SendMessageCommand.attachments` → `compose`.
- `packages/infrastructure/src/supabase-messaging-repository.ts` — persist +
  `findById` + read-view mappers for attachments (tombstoned on delete).
- `apps/web/src/app/_actions/chat-actions.ts` — `sendChatMessage(…, attachments)`.
- `apps/web/src/components/chat-image.tsx` — **new**; signs + renders one image.
- `apps/web/src/components/conversation-view.tsx` — composer upload + pending
  preview strip + attachment rendering.

## Patterns observed

- **Reserving the column in Phase 0 paid off.** Because `attachments jsonb` and
  the body-or-attachment `messages_nonempty` CHECK shipped up front (pinned by a
  separate droppable CHECK), enabling images was a one-line `drop constraint` —
  no backfill, no column add, no rewrite of existing rows. Worth doing whenever a
  later phase is known.
- **DEFINER / INVOKER / direct-port / storage-RLS — same gate question.** Storage
  policies are a fourth surface that asks the identical "what can the caller's RLS
  context see?" question: the bucket reuses `can_access_conversation` so a chat
  image is exactly as private as the conversation it belongs to. No new
  authorization concept.

## Follow-ups

(Tracked in [ADR 0028](../adr/0028-chat-messaging.md).)

- **Attachment orphan cleanup** — a soft-deleted or abandoned upload leaves the
  storage object; add a retention cron like `hero_images_orphan_cleanup`.
- **e2e** for upload → send → the recipient sees the image live (and a non-member
  cannot sign its URL), alongside the carried-over Phase 1–3 checks.
- Carried over: live unread badge, mark-read-after-send, sender card in the
  broadcast payload, start-a-DM-from-inbox, blocked-state banner.
