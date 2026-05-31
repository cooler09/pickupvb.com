import {
  ConversationId,
  Message,
  MessageId,
  UnauthorizedError,
  UserId,
  type ConversationKind,
  type ConversationQueries,
  type ConversationRepository,
  type InboxItem,
  type MessagePage,
  type MessageQueries,
  type MessageRepository,
  type MessageView,
  type RoomKind,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Messaging adapters (ADR 0028) — the three chat ports backed by Supabase.
 *
 * Every chat write runs under the caller's session so RLS is the real
 * authorization gate (AGENTS.md pitfall #8): the `messages` INSERT/UPDATE
 * policies and the `get_or_create_conversation` membership RPC all read the
 * real `auth.uid()`. These adapters therefore **require** a user-scoped client
 * — the composition root builds them per request in `getChatHandlers()`. A
 * Postgres `42501` (insufficient_privilege / RLS-violation) surfaces as a typed
 * {@link UnauthorizedError} so the HTTP boundary maps it to 401, never a 500.
 */

const RLS_DENIED = '42501';
const UNIQUE_VIOLATION = '23505';

// ---- Write: conversations -------------------------------------------------

export class SupabaseConversationRepository implements ConversationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getOrCreateRoom(kind: RoomKind, contextId: string): Promise<ConversationId> {
    const { data, error } = await this.client.rpc('get_or_create_conversation', {
      p_kind: kind,
      p_context_id: contextId,
    });
    if (error) {
      if (error.code === RLS_DENIED) {
        throw new UnauthorizedError('You are not a member of this conversation.');
      }
      throw new Error(
        `Conversation.getOrCreateRoom(${kind}, ${contextId}) failed: ${error.message}`,
      );
    }
    return ConversationId(data as string);
  }

  async getOrCreateDm(otherUserId: UserId): Promise<ConversationId> {
    const { data, error } = await this.client.rpc('get_or_create_dm', {
      p_other_id: String(otherUserId),
    });
    if (error) {
      if (error.code === RLS_DENIED) {
        throw new UnauthorizedError('You cannot message this user.');
      }
      throw new Error(`Conversation.getOrCreateDm(${otherUserId}) failed: ${error.message}`);
    }
    return ConversationId(data as string);
  }

  async markRead(conversationId: ConversationId, userId: UserId): Promise<void> {
    // Upsert the caller's own participant row — for room conversations the row
    // may not exist yet (room membership is derived, not materialized), so this
    // both creates and advances it. RLS gates the write to `auth.uid()`.
    const { error } = await this.client.from('conversation_participants').upsert(
      {
        conversation_id: String(conversationId),
        user_id: String(userId),
        last_read_at: new Date().toISOString(),
      } as never,
      { onConflict: 'conversation_id,user_id' },
    );
    if (error) throw new Error(`Conversation.markRead(${conversationId}) failed: ${error.message}`);
  }
}

// ---- Write: messages ------------------------------------------------------

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  deleted_at: string | null;
  edited_at: string | null;
};

function rowToAggregate(row: MessageRow): Message {
  return Message.fromPersistence({
    id: MessageId(row.id),
    conversationId: ConversationId(row.conversation_id),
    senderId: UserId(row.sender_id),
    body: row.body,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    editedAt: row.edited_at ? new Date(row.edited_at) : null,
  });
}

export class SupabaseMessageRepository implements MessageRepository {
  constructor(private readonly client: SupabaseClient) {}

  async add(message: Message): Promise<void> {
    const { error } = await this.client.from('messages').insert({
      id: String(message.id),
      conversation_id: String(message.conversationId),
      sender_id: String(message.senderId),
      body: message.body,
    } as never);
    if (error) {
      if (error.code === RLS_DENIED) {
        throw new UnauthorizedError('You cannot post to this conversation.');
      }
      throw new Error(`Message.add(${message.id}) failed: ${error.message}`);
    }
  }

  async findById(id: MessageId): Promise<Message | null> {
    const { data, error } = await this.client
      .from('messages')
      .select('id, conversation_id, sender_id, body, deleted_at, edited_at')
      .eq('id', String(id))
      .maybeSingle();
    if (error) throw new Error(`Message.findById(${id}) failed: ${error.message}`);
    if (!data) return null;
    return rowToAggregate(data as unknown as MessageRow);
  }

  async save(message: Message): Promise<void> {
    // Only the mutable lifecycle columns — body (edit), edited_at, deleted_at
    // (soft-delete). `report_count` / `created_at` stay DB-managed.
    const { error } = await this.client
      .from('messages')
      .update({
        body: message.body,
        edited_at: message.editedAt ? message.editedAt.toISOString() : null,
        deleted_at: message.deletedAt ? message.deletedAt.toISOString() : null,
      } as never)
      .eq('id', String(message.id));
    if (error) {
      if (error.code === RLS_DENIED) {
        throw new UnauthorizedError('You are not allowed to change this message.');
      }
      throw new Error(`Message.save(${message.id}) failed: ${error.message}`);
    }
  }

  async addReport(messageId: MessageId, reporterId: UserId, reason: string | null): Promise<void> {
    const { error } = await this.client.from('message_reports').insert({
      message_id: String(messageId),
      reporter_user_id: String(reporterId),
      reason,
    } as never);
    if (error) {
      // Unique (message_id, reporter_user_id): re-reporting is an idempotent no-op.
      if (error.code === UNIQUE_VIOLATION) return;
      if (error.code === RLS_DENIED) {
        throw new UnauthorizedError('You cannot report this message.');
      }
      throw new Error(`Message.addReport(${messageId}) failed: ${error.message}`);
    }
  }
}

// ---- Read: message queries ------------------------------------------------

type MessageViewRow = MessageRow & {
  created_at: string;
  // Embedded sender card — disambiguated by the sender_id FK because `messages`
  // also FKs `profiles` via `deleted_by`.
  sender: { display_name: string | null; avatar_url: string | null } | null;
};

function rowToView(row: MessageViewRow): MessageView {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender?.display_name ?? null,
    senderAvatarUrl: row.sender?.avatar_url ?? null,
    // Tombstone: never expose a deleted message's body, even to sender/moderator.
    body: deleted ? '' : row.body,
    isDeleted: deleted,
    isEdited: row.edited_at !== null,
    createdAt: row.created_at,
  };
}

export class SupabaseMessageQueries implements MessageQueries {
  constructor(private readonly client: SupabaseClient) {}

  async listMessages(
    conversationId: string,
    opts: { limit: number; before?: string },
  ): Promise<MessagePage> {
    // Fetch newest-first (one extra to compute `hasMore`), then flip to
    // ascending for display. RLS restricts visibility (non-deleted to members;
    // own + moderated rows as tombstones).
    const fetchLimit = opts.limit + 1;
    let q = this.client
      .from('messages')
      .select(
        'id, conversation_id, sender_id, body, deleted_at, edited_at, created_at, sender:profiles!messages_sender_id_fkey(display_name, avatar_url)',
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(fetchLimit);
    if (opts.before) q = q.lt('created_at', opts.before);

    const { data, error } = await q;
    if (error) throw new Error(`listMessages(${conversationId}) failed: ${error.message}`);

    const rows = (data as unknown as MessageViewRow[] | null) ?? [];
    const hasMore = rows.length > opts.limit;
    const page = hasMore ? rows.slice(0, opts.limit) : rows;
    const ascending = [...page].reverse();
    const messages = ascending.map(rowToView);
    // Cursor to fetch the next-older page = the oldest message currently loaded.
    const nextBefore = hasMore && ascending.length > 0 ? (ascending[0]?.created_at ?? null) : null;

    return { messages, hasMore, nextBefore };
  }
}

// ---- Read: conversation queries (inbox + badge) ---------------------------

type InboxRpcRow = {
  conversation_id: string;
  kind: ConversationKind;
  context_id: string | null;
  context_slug: string | null;
  title: string | null;
  last_message_at: string | null;
  last_read_at: string | null;
  is_unread: boolean;
  preview: string | null;
  preview_sender_id: string | null;
};

function rowToInbox(row: InboxRpcRow): InboxItem {
  return {
    conversationId: row.conversation_id,
    kind: row.kind,
    contextId: row.context_id,
    contextSlug: row.context_slug,
    title: row.title,
    lastMessageAt: row.last_message_at,
    lastReadAt: row.last_read_at,
    isUnread: row.is_unread,
    preview: row.preview,
    previewSenderId: row.preview_sender_id,
  };
}

export class SupabaseConversationQueries implements ConversationQueries {
  constructor(private readonly client: SupabaseClient) {}

  async listInbox(): Promise<InboxItem[]> {
    // SECURITY INVOKER RPC — RLS on `conversations` scopes the result to the
    // caller's accessible rooms; the RPC resolves titles/previews/slugs in SQL.
    const { data, error } = await this.client.rpc('get_inbox', { p_limit: 50 });
    if (error) throw new Error(`listInbox failed: ${error.message}`);
    return ((data as unknown as InboxRpcRow[] | null) ?? []).map(rowToInbox);
  }

  async countUnread(): Promise<number> {
    const { data, error } = await this.client.rpc('count_unread_conversations');
    if (error) throw new Error(`countUnread failed: ${error.message}`);
    return (data as number | null) ?? 0;
  }
}
