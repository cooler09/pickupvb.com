/**
 * Read-side queries for the messaging subdomain (CQRS read port). Writes go
 * through {@link Message} + the repositories; this is purely the display side,
 * so the shapes are plain camelCase read models with no behavior. Per-viewer and
 * live — these reads are never cached (caching would fight Realtime delivery).
 */

import type { ConversationKind } from './conversation.js';

/** An image attachment as rendered in a thread (Phase 4). The display layer
 * mints a short-lived signed URL from `bucket`/`path` (the bucket is private);
 * `width`/`height` let it reserve layout space before the image loads. */
export interface MessageAttachmentView {
  bucket: string;
  path: string;
  width: number | null;
  height: number | null;
  mime: string;
}

/** A message as rendered in a thread. Deleted messages still come back (as a
 * tombstone) for the sender/moderator; the view carries `isDeleted` so the UI
 * can render "message deleted" without exposing the body (or attachments). */
export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  body: string;
  attachments: MessageAttachmentView[];
  isDeleted: boolean;
  isEdited: boolean;
  createdAt: string;
}

/** A page of a conversation's messages, oldest-first for display. `nextBefore`
 * is the cursor (oldest loaded message's `created_at`) for fetching older
 * messages; `null` once the start of the conversation is reached. */
export interface MessagePage {
  messages: MessageView[];
  hasMore: boolean;
  nextBefore: string | null;
}

export interface MessageQueries {
  /**
   * A page of messages for a conversation. Returns up to `limit` of the most
   * recent messages (or those older than `before`), in ascending chronological
   * order. Access is enforced by RLS on the underlying `messages` select.
   */
  listMessages(
    conversationId: string,
    opts: { limit: number; before?: string },
  ): Promise<MessagePage>;
}

/**
 * A conversation as rendered in the inbox (ADR 0028, Phase 2). `title` /
 * `contextSlug` are resolved from the source entity (team / event / group) at
 * read time; `preview` is the latest non-deleted message body (truncated).
 * `isUnread` is "unread by me" — a newer non-deleted message from someone else
 * than the viewer's `last_read_at` cursor (a thread you only posted in yourself
 * is not unread).
 */
export interface InboxItem {
  conversationId: string;
  kind: ConversationKind;
  contextId: string | null;
  /** Slug for routing — team / group rooms only; `null` otherwise. */
  contextSlug: string | null;
  title: string | null;
  lastMessageAt: string | null;
  lastReadAt: string | null;
  isUnread: boolean;
  preview: string | null;
  previewSenderId: string | null;
}

/**
 * Conversation-level read port (the inbox + header badge). Separate from
 * {@link MessageQueries} (which is thread-scoped). Both are per-viewer; the
 * viewer is implicit in the user-scoped client — RLS scopes the reads, so no
 * `viewerId` argument is passed (the same posture as `listMessages`).
 */
export interface ConversationQueries {
  /** The viewer's conversations with activity, most-recent first. */
  listInbox(): Promise<InboxItem[]>;
  /** Count of conversations with messages unread by the viewer (header badge). */
  countUnread(): Promise<number>;
}
