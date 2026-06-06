import type { ConversationQueries, InboxItem, MessagePage, MessageQueries } from '@pickupvb/domain';
import { ListMessagesQuery } from '../messages/index';

/** Read a page of a conversation's messages (oldest-first; `before` paginates
 * into older messages). Access is enforced by RLS on the underlying select. */
export class ListMessagesHandler {
  constructor(private readonly queries: MessageQueries) {}

  async execute({ conversationId, limit, before }: ListMessagesQuery): Promise<MessagePage> {
    return this.queries.listMessages(conversationId, {
      limit,
      ...(before ? { before } : {}),
    });
  }
}

/** The viewer's inbox (ADR 0028, Phase 2). Viewer is implicit in the
 * user-scoped client; RLS scopes the result, so no query object is needed. */
export class ListInboxHandler {
  constructor(private readonly queries: ConversationQueries) {}

  async execute(): Promise<InboxItem[]> {
    return this.queries.listInbox();
  }
}

/** Count of conversations with messages unread by the viewer (header badge). */
export class CountUnreadConversationsHandler {
  constructor(private readonly queries: ConversationQueries) {}

  async execute(): Promise<number> {
    return this.queries.countUnread();
  }
}
