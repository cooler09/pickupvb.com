/**
 * Read-side queries for the messaging subdomain (CQRS read port). Writes go
 * through {@link Message} + the repositories; this is purely the display side,
 * so the shapes are plain camelCase read models with no behavior. Per-viewer and
 * live — these reads are never cached (caching would fight Realtime delivery).
 */

/** A message as rendered in a thread. Deleted messages still come back (as a
 * tombstone) for the sender/moderator; the view carries `isDeleted` so the UI
 * can render "message deleted" without exposing the body. */
export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  body: string;
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
