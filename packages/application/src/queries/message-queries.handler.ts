import type { MessagePage, MessageQueries } from '@pickupvb/domain';
import { ListMessagesQuery } from '../messages';

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
