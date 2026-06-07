import type { ConversationKind, MessageAttachment, RoomKind } from '@pickupvb/domain';

// ---- Messaging (chat) — ADR 0028 -----------------------------------------

/** Open (get-or-create) the single room conversation for a team/event/group. */
export class OpenConversationCommand {
  constructor(
    public readonly kind: RoomKind,
    public readonly contextId: string,
  ) {}
}

/** Open (get-or-create) the canonical 1:1 DM with another user (ADR 0028,
 * Phase 3). Anonymous callers and blocked pairs surface as `UnauthorizedError`. */
export class OpenDmCommand {
  constructor(public readonly otherUserId: string) {}
}

export class SendMessageCommand {
  constructor(
    public readonly conversationId: string,
    public readonly senderId: string,
    public readonly body: string,
    /** From the JWT `is_anonymous` claim — anonymous users cannot post. */
    public readonly isAnonymous: boolean,
    /** Already-uploaded image attachments (Phase 4); empty for text-only. */
    public readonly attachments: MessageAttachment[] = [],
    /** Drives the moderation policy (ADR 0030): `'dm'` → block-extreme only,
     * the three room kinds → mask Tier-A profanity. Defaults to the stricter
     * room treatment. */
    public readonly conversationKind: ConversationKind = 'team',
  ) {}
}

export class EditMessageCommand {
  constructor(
    public readonly messageId: string,
    public readonly actorId: string,
    public readonly body: string,
    /** Mirrors {@link SendMessageCommand.conversationKind} — drives the
     * moderation policy on the edited body. */
    public readonly conversationKind: ConversationKind = 'team',
  ) {}
}

export class DeleteMessageCommand {
  constructor(
    public readonly messageId: string,
    public readonly actorId: string,
  ) {}
}

export class ReportMessageCommand {
  constructor(
    public readonly messageId: string,
    public readonly reporterId: string,
    public readonly reason: string | null,
  ) {}
}

export class MarkConversationReadCommand {
  constructor(
    public readonly conversationId: string,
    public readonly userId: string,
  ) {}
}

export class ListMessagesQuery {
  constructor(
    public readonly conversationId: string,
    public readonly limit: number,
    public readonly before?: string,
  ) {}
}
