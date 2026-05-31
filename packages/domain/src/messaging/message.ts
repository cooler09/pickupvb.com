import { AggregateRoot } from '../shared/aggregate-root.js';
import { idConstructor, type Brand } from '../shared/brand.js';
import { ConflictError, UnauthorizedError, ValidationError } from '../shared/result.js';
import type { UserId } from '../events/volleyball-event.js';
import type { ConversationId } from './conversation.js';

export type MessageId = Brand<string, 'MessageId'>;
export const MessageId = idConstructor<'MessageId'>();

/** Mirrors the `messages.body` length CHECK in the DB. */
export const MAX_MESSAGE_LENGTH = 4000;

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
  }): Message {
    if (props.isAnonymous) {
      throw new UnauthorizedError('Sign in to send messages.');
    }
    const body = Message.assertBody(props.body);
    return new Message(props.id, props.conversationId, props.senderId, body, null, null);
  }

  /** Rehydrate a persisted `messages` row (no re-validation). */
  static fromPersistence(props: {
    id: MessageId;
    conversationId: ConversationId;
    senderId: UserId;
    body: string;
    deletedAt: Date | null;
    editedAt: Date | null;
  }): Message {
    return new Message(
      props.id,
      props.conversationId,
      props.senderId,
      props.body,
      props.deletedAt,
      props.editedAt,
    );
  }

  private static assertBody(raw: string): string {
    const body = raw.trim();
    if (body.length === 0) {
      throw new ValidationError('Message cannot be empty.', { field: 'body' });
    }
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new ValidationError(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`, {
        field: 'body',
      });
    }
    return body;
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
  get deletedAt(): Date | null {
    return this._deletedAt;
  }
  get editedAt(): Date | null {
    return this._editedAt;
  }
  get isDeleted(): boolean {
    return this._deletedAt !== null;
  }

  /** Edit the body — sender only, and not after deletion. */
  edit(actorId: UserId, body: string): void {
    if (actorId !== this._senderId) {
      throw new UnauthorizedError('You can only edit your own messages.');
    }
    if (this._deletedAt !== null) {
      throw new ConflictError('Cannot edit a deleted message.');
    }
    this._body = Message.assertBody(body);
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
