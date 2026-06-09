import { randomUUID } from 'node:crypto';
import {
  ConversationId,
  Message,
  MessageId,
  NotFoundError,
  UserId,
  type ConversationRepository,
  type MessageRepository,
} from '@pickupvb/domain';
import {
  DeleteMessageCommand,
  EditMessageCommand,
  MarkConversationReadCommand,
  OpenConversationCommand,
  OpenDmCommand,
  ReportMessageCommand,
  SendMessageCommand,
} from '../messages/index';

/**
 * Open (get-or-create) the single room conversation for a context. Membership
 * against the source table is enforced server-side by the
 * `get_or_create_conversation` RPC; a non-member surfaces as `UnauthorizedError`.
 */
export class OpenConversationHandler {
  constructor(private readonly repo: ConversationRepository) {}

  async execute({ kind, contextId }: OpenConversationCommand): Promise<{ id: string }> {
    const id = await this.repo.getOrCreateRoom(kind, contextId);
    return { id };
  }
}

/**
 * Open (get-or-create) the canonical 1:1 DM with another user. Membership of a
 * DM is materialized (the two participant rows ARE the access grant); anonymous
 * callers and blocked pairs are rejected server-side as `UnauthorizedError`.
 */
export class OpenDmHandler {
  constructor(private readonly repo: ConversationRepository) {}

  async execute({ otherUserId }: OpenDmCommand): Promise<{ id: string }> {
    const id = await this.repo.getOrCreateDm(UserId(otherUserId));
    return { id };
  }
}

/**
 * Send a message. The aggregate enforces the non-anonymous + non-empty/length
 * rules; conversation access is enforced by RLS on the INSERT (the repo maps a
 * permission failure to `UnauthorizedError`).
 */
export class SendMessageHandler {
  constructor(private readonly repo: MessageRepository) {}

  async execute({
    conversationId,
    senderId,
    body,
    isAnonymous,
    attachments,
    conversationKind,
  }: SendMessageCommand): Promise<{ id: string; body: string }> {
    const message = Message.compose({
      id: MessageId(randomUUID()),
      conversationId: ConversationId(conversationId),
      senderId: UserId(senderId),
      body,
      isAnonymous,
      attachments,
      // DMs are private (block extreme only); rooms are public (mask). ADR 0030.
      policy: conversationKind === 'dm' ? 'block-extreme' : 'mask',
    });
    await this.repo.add(message);
    // Return the *moderated* body (rooms mask Tier-A profanity) so the caller's
    // notification preview shows the stored text, not the raw input.
    return { id: message.id, body: message.body };
  }
}

/** Edit a message — sender only (aggregate-enforced); not after deletion. */
export class EditMessageHandler {
  constructor(private readonly repo: MessageRepository) {}

  async execute({ messageId, actorId, body, conversationKind }: EditMessageCommand): Promise<void> {
    const message = await this.repo.findById(MessageId(messageId));
    if (!message) throw new NotFoundError('message', messageId);
    message.edit(UserId(actorId), body, conversationKind === 'dm' ? 'block-extreme' : 'mask');
    await this.repo.save(message);
  }
}

/**
 * Soft-delete a message. The sender may always delete their own; a non-sender
 * must be a room moderator — `canModerate` (the pre-flight of
 * `can_moderate_conversation`) is consulted only on that rarer path so the
 * common self-delete pays no extra round-trip.
 */
export class DeleteMessageHandler {
  constructor(
    private readonly repo: MessageRepository,
    private readonly canModerate: (conversationId: string) => Promise<boolean>,
  ) {}

  async execute({ messageId, actorId }: DeleteMessageCommand): Promise<void> {
    const message = await this.repo.findById(MessageId(messageId));
    if (!message) throw new NotFoundError('message', messageId);
    const isSender = message.senderId === UserId(actorId);
    const canMod = isSender ? false : await this.canModerate(message.conversationId);
    message.softDelete(UserId(actorId), canMod);
    await this.repo.save(message);
  }
}

/** File a moderation report (DB trigger counts + auto-hides). */
export class ReportMessageHandler {
  constructor(private readonly repo: MessageRepository) {}

  async execute({ messageId, reporterId, reason }: ReportMessageCommand): Promise<void> {
    await this.repo.addReport(MessageId(messageId), UserId(reporterId), reason);
  }
}

/** Advance the caller's read cursor for a conversation. */
export class MarkConversationReadHandler {
  constructor(private readonly repo: ConversationRepository) {}

  async execute({ conversationId, userId }: MarkConversationReadCommand): Promise<void> {
    await this.repo.markRead(ConversationId(conversationId), UserId(userId));
  }
}
