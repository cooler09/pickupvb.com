import { describe, it, expect } from 'vitest';
import { Message, MessageId, MAX_ATTACHMENTS, type MessageAttachment } from './message.js';
import { ConversationId } from './conversation.js';
import { UserId } from '../events/volleyball-event.js';
import { ConflictError, UnauthorizedError, ValidationError } from '../shared/result.js';

const mid = MessageId('11111111-1111-1111-1111-111111111111');
const cid = ConversationId('22222222-2222-2222-2222-222222222222');
const sender = UserId('33333333-3333-3333-3333-333333333333');
const other = UserId('44444444-4444-4444-4444-444444444444');

function composed(body = 'hello team') {
  return Message.compose({
    id: mid,
    conversationId: cid,
    senderId: sender,
    body,
    isAnonymous: false,
  });
}

describe('Message.compose', () => {
  it('composes a valid message and trims the body', () => {
    const m = composed('  hi there  ');
    expect(m.body).toBe('hi there');
    expect(m.senderId).toBe(sender);
    expect(m.conversationId).toBe(cid);
    expect(m.isDeleted).toBe(false);
  });

  it('rejects an anonymous sender', () => {
    expect(() =>
      Message.compose({
        id: mid,
        conversationId: cid,
        senderId: sender,
        body: 'hi',
        isAnonymous: true,
      }),
    ).toThrow(UnauthorizedError);
  });

  it('rejects an empty / whitespace-only body', () => {
    expect(() => composed('   ')).toThrow(ValidationError);
  });

  it('rejects an over-length body', () => {
    expect(() => composed('x'.repeat(4001))).toThrow(ValidationError);
  });
});

function imageAttachment(overrides: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    bucket: 'chat-attachments',
    path: `${cid}/${sender}/pic.png`,
    width: 800,
    height: 600,
    mime: 'image/png',
    size: 1024,
    ...overrides,
  };
}

describe('Message.compose with attachments', () => {
  it('allows an empty body when an image attachment is present', () => {
    const m = Message.compose({
      id: mid,
      conversationId: cid,
      senderId: sender,
      body: '   ',
      isAnonymous: false,
      attachments: [imageAttachment()],
    });
    expect(m.body).toBe('');
    expect(m.attachments).toHaveLength(1);
  });

  it('rejects more than the attachment cap', () => {
    expect(() =>
      Message.compose({
        id: mid,
        conversationId: cid,
        senderId: sender,
        body: 'hi',
        isAnonymous: false,
        attachments: Array.from({ length: MAX_ATTACHMENTS + 1 }, () => imageAttachment()),
      }),
    ).toThrow(ValidationError);
  });

  it('rejects a non-image attachment', () => {
    expect(() =>
      Message.compose({
        id: mid,
        conversationId: cid,
        senderId: sender,
        body: 'hi',
        isAnonymous: false,
        attachments: [imageAttachment({ mime: 'application/pdf' })],
      }),
    ).toThrow(ValidationError);
  });

  it('rejects an oversize attachment', () => {
    expect(() =>
      Message.compose({
        id: mid,
        conversationId: cid,
        senderId: sender,
        body: 'hi',
        isAnonymous: false,
        attachments: [imageAttachment({ size: 11 * 1024 * 1024 })],
      }),
    ).toThrow(ValidationError);
  });
});

describe('Message.edit', () => {
  it('lets the sender edit and marks it edited', () => {
    const m = composed();
    m.edit(sender, 'updated body');
    expect(m.body).toBe('updated body');
    expect(m.editedAt).not.toBeNull();
  });

  it('rejects a non-sender editor', () => {
    const m = composed();
    expect(() => m.edit(other, 'nope')).toThrow(UnauthorizedError);
  });

  it('rejects editing a deleted message', () => {
    const m = composed();
    m.softDelete(sender, false);
    expect(() => m.edit(sender, 'nope')).toThrow(ConflictError);
  });

  it('rejects an empty edit', () => {
    const m = composed();
    expect(() => m.edit(sender, '   ')).toThrow(ValidationError);
  });
});

describe('Message.softDelete', () => {
  it('lets the sender delete their own message', () => {
    const m = composed();
    m.softDelete(sender, false);
    expect(m.isDeleted).toBe(true);
  });

  it('lets a moderator delete someone else’s message', () => {
    const m = composed();
    m.softDelete(other, true);
    expect(m.isDeleted).toBe(true);
  });

  it('rejects a non-sender, non-moderator', () => {
    const m = composed();
    expect(() => m.softDelete(other, false)).toThrow(UnauthorizedError);
  });

  it('is idempotent', () => {
    const m = composed();
    m.softDelete(sender, false);
    expect(() => m.softDelete(sender, false)).not.toThrow();
    expect(m.isDeleted).toBe(true);
  });
});
