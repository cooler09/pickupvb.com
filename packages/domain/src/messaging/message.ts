import { AggregateRoot } from '../shared/aggregate-root.js';
import { idConstructor, type Brand } from '../shared/brand.js';
import { ConflictError, UnauthorizedError, ValidationError } from '../shared/result.js';
import { contentModeration, type ModerationPolicy } from '../moderation/content-moderation.js';
import type { UserId } from '../events/volleyball-event.js';
import type { ConversationId } from './conversation.js';

export type MessageId = Brand<string, 'MessageId'>;
export const MessageId = idConstructor<'MessageId'>();

/** Mirrors the `messages.body` length CHECK in the DB. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Caps for image attachments (Phase 4). The byte cap mirrors the
 * `chat-attachments` bucket `file_size_limit`; the count cap is app-only. */
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * A single image attachment on a message — the value persisted to the
 * `messages.attachments` jsonb array. `bucket`/`path` locate the (private)
 * storage object; the app mints a short-lived signed URL to display it.
 */
export interface MessageAttachment {
  bucket: string;
  path: string;
  width: number | null;
  height: number | null;
  mime: string;
  size: number;
}

/**
 * A single chat message — the write aggregate of the `messaging` subdomain.
 *
 * It exists (rather than a facade-over-port shortcut) because chat sends/edits/
 * deletes carry real, unit-testable rules that should live in one place rather
 * than be scattered across server actions and SQL: the anonymous-posting guard,
 * body validation, and sender-vs-moderator authorization on the `deleted_at`
 * state machine.
 *
 * Conversation *access* is deliberately NOT pre-flighted on the hot send path —
 * RLS enforces `can_access_conversation` authoritatively on INSERT, and doubling
 * the DB round-trips per message to re-check it in the app would be pure cost
 * (AGENTS.md pitfall #8 — RLS is the real gate; the repo maps a permission
 * failure to a typed `UnauthorizedError`). The `canModerate` flag IS the
 * application pre-flight of `can_moderate_conversation`, but it's only consulted
 * when a non-sender deletes a message (the rare moderator path), so the common
 * self-delete never pays for it.
 *
 * Attachments are intentionally not modeled yet — Phase 1 is text-only (the DB
 * pins `attachments = '[]'`); the image fast-follow (Phase 4) adds them here.
 */
export class Message extends AggregateRoot<MessageId> {
  private constructor(
    id: MessageId,
    private readonly _conversationId: ConversationId,
    private readonly _senderId: UserId,
    private _body: string,
    private readonly _attachments: MessageAttachment[],
    private _deletedAt: Date | null,
    private _editedAt: Date | null,
  ) {
    super(id);
  }

  /**
   * Compose a brand-new message. Enforces the locally-checkable send rules: a
   * real (non-anonymous) account and a non-empty body within the length cap.
   * Conversation access is left to RLS on the subsequent INSERT.
   */
  static compose(props: {
    id: MessageId;
    conversationId: ConversationId;
    senderId: UserId;
    body: string;
    isAnonymous: boolean;
    attachments?: MessageAttachment[];
    /** Moderation policy for the surface: `'mask'` for context rooms (public),
     * `'block-extreme'` for DMs (private). Defaults to the stricter `'mask'`.
     * See ADR 0030. */
    policy?: ModerationPolicy;
  }): Message {
    if (props.isAnonymous) {
      throw new UnauthorizedError('Sign in to send messages.');
    }
    const attachments = props.attachments ?? [];
    Message.assertAttachments(attachments);
    const body = Message.assertContent(props.body, attachments, props.policy ?? 'mask');
    return new Message(
      props.id,
      props.conversationId,
      props.senderId,
      body,
      attachments,
      null,
      null,
    );
  }

  /** Rehydrate a persisted `messages` row (no re-validation). */
  static fromPersistence(props: {
    id: MessageId;
    conversationId: ConversationId;
    senderId: UserId;
    body: string;
    attachments?: MessageAttachment[];
    deletedAt: Date | null;
    editedAt: Date | null;
  }): Message {
    return new Message(
      props.id,
      props.conversationId,
      props.senderId,
      props.body,
      props.attachments ?? [],
      props.deletedAt,
      props.editedAt,
    );
  }

  /**
   * Validate the body against the length cap and the content rule: a message
   * must carry text or at least one attachment (mirrors the DB
   * `messages_nonempty` CHECK). Returns the trimmed body (possibly empty when
   * attachments stand in for it).
   */
  private static assertContent(
    raw: string,
    attachments: MessageAttachment[],
    policy: ModerationPolicy,
  ): string {
    const body = raw.trim();
    if (body.length === 0 && attachments.length === 0) {
      throw new ValidationError('Message cannot be empty.', { field: 'body' });
    }
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new ValidationError(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`, {
        field: 'body',
      });
    }
    // Screen per the surface policy: rooms mask Tier-A profanity (stored
    // censored — mask-at-write), DMs leave it; both block Tier-B. ADR 0030.
    return contentModeration.screen(body, policy).cleaned;
  }

  private static assertAttachments(attachments: MessageAttachment[]): void {
    if (attachments.length > MAX_ATTACHMENTS) {
      throw new ValidationError(`Too many attachments (max ${MAX_ATTACHMENTS}).`, {
        field: 'attachments',
      });
    }
    for (const a of attachments) {
      if (!a.mime.startsWith('image/')) {
        throw new ValidationError('Only image attachments are supported.', {
          field: 'attachments',
        });
      }
      if (a.size <= 0 || a.size > MAX_ATTACHMENT_BYTES) {
        throw new ValidationError('Attachment is too large.', { field: 'attachments' });
      }
    }
  }

  get conversationId(): ConversationId {
    return this._conversationId;
  }
  get senderId(): UserId {
    return this._senderId;
  }
  get body(): string {
    return this._body;
  }
  get attachments(): readonly MessageAttachment[] {
    return this._attachments;
  }
  get deletedAt(): Date | null {
    return this._deletedAt;
  }
  get editedAt(): Date | null {
    return this._editedAt;
  }
  get isDeleted(): boolean {
    return this._deletedAt !== null;
  }

  /** Edit the body — sender only, and not after deletion. `policy` mirrors
   * `compose` (room `'mask'` vs DM `'block-extreme'`); defaults to `'mask'`. */
  edit(actorId: UserId, body: string, policy: ModerationPolicy = 'mask'): void {
    if (actorId !== this._senderId) {
      throw new UnauthorizedError('You can only edit your own messages.');
    }
    if (this._deletedAt !== null) {
      throw new ConflictError('Cannot edit a deleted message.');
    }
    this._body = Message.assertContent(body, this._attachments, policy);
    this._editedAt = new Date();
  }

  /**
   * Soft-delete — the sender, or a moderator (room host/captain/owner). `canModerate`
   * is the application-layer pre-flight of `can_moderate_conversation`. Idempotent.
   */
  softDelete(actorId: UserId, canModerate: boolean): void {
    if (actorId !== this._senderId && !canModerate) {
      throw new UnauthorizedError('You are not allowed to delete this message.');
    }
    if (this._deletedAt !== null) return; // idempotent
    this._deletedAt = new Date();
  }
}

/**
 * Write port for messages. `add` inserts a composed message; `findById` + `save`
 * back edit/soft-delete; `addReport` files a moderation report (the DB trigger
 * does the counting + auto-hide). All run on the caller's user-scoped client so
 * RLS is the real authorization gate.
 */
export interface MessageRepository {
  add(message: Message): Promise<void>;
  findById(id: MessageId): Promise<Message | null>;
  save(message: Message): Promise<void>;
  /** File a report (unique per reporter; idempotent re-report is a no-op). */
  addReport(messageId: MessageId, reporterId: UserId, reason: string | null): Promise<void>;
}
