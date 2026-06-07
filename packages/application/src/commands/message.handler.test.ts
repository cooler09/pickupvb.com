import { describe, it, expect, vi } from 'vitest';
import {
  ConversationId,
  Message,
  MessageId,
  NotFoundError,
  UnauthorizedError,
  UserId,
  type ConversationRepository,
  type MessageRepository,
  type RoomKind,
} from '@pickupvb/domain';
import {
  DeleteMessageCommand,
  EditMessageCommand,
  OpenConversationCommand,
  ReportMessageCommand,
  SendMessageCommand,
} from '../messages/index';
import {
  DeleteMessageHandler,
  EditMessageHandler,
  OpenConversationHandler,
  ReportMessageHandler,
  SendMessageHandler,
} from './message.handler.js';

const CID = '22222222-2222-2222-2222-222222222222';
const SENDER = '33333333-3333-3333-3333-333333333333';
const OTHER = '44444444-4444-4444-4444-444444444444';

class FakeMessageRepo implements MessageRepository {
  readonly added: Message[] = [];
  readonly saved: Message[] = [];
  readonly reports: Array<{ messageId: string; reporterId: string; reason: string | null }> = [];
  readonly store = new Map<string, Message>();

  async add(message: Message): Promise<void> {
    this.added.push(message);
    this.store.set(message.id, message);
  }
  async findById(id: MessageId): Promise<Message | null> {
    return this.store.get(id) ?? null;
  }
  async save(message: Message): Promise<void> {
    this.saved.push(message);
  }
  async addReport(messageId: MessageId, reporterId: UserId, reason: string | null): Promise<void> {
    this.reports.push({ messageId, reporterId, reason });
  }
}

class FakeConversationRepo implements ConversationRepository {
  async getOrCreateRoom(_kind: RoomKind, _contextId: string): Promise<ConversationId> {
    return ConversationId(CID);
  }
  async getOrCreateDm(_otherUserId: UserId): Promise<ConversationId> {
    return ConversationId(CID);
  }
  async markRead(): Promise<void> {}
}

function seedMessage(repo: FakeMessageRepo, id: string, senderId = SENDER): Message {
  const m = Message.compose({
    id: MessageId(id),
    conversationId: ConversationId(CID),
    senderId: UserId(senderId),
    body: 'original',
    isAnonymous: false,
  });
  repo.store.set(id, m);
  return m;
}

describe('SendMessageHandler', () => {
  it('composes and persists a message', async () => {
    const repo = new FakeMessageRepo();
    const out = await new SendMessageHandler(repo).execute(
      new SendMessageCommand(CID, SENDER, 'hi team', false),
    );
    expect(repo.added).toHaveLength(1);
    expect(repo.added[0]?.body).toBe('hi team');
    expect(out.id).toBe(repo.added[0]?.id);
  });

  it('rejects an anonymous sender before persisting', async () => {
    const repo = new FakeMessageRepo();
    await expect(
      new SendMessageHandler(repo).execute(new SendMessageCommand(CID, SENDER, 'hi', true)),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(repo.added).toHaveLength(0);
  });
});

describe('EditMessageHandler', () => {
  it('throws NotFound for a missing message', async () => {
    const repo = new FakeMessageRepo();
    await expect(
      new EditMessageHandler(repo).execute(new EditMessageCommand('missing', SENDER, 'x')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('edits and saves an existing message', async () => {
    const repo = new FakeMessageRepo();
    const id = '11111111-1111-1111-1111-111111111111';
    seedMessage(repo, id);
    await new EditMessageHandler(repo).execute(new EditMessageCommand(id, SENDER, 'edited'));
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]?.body).toBe('edited');
  });
});

describe('DeleteMessageHandler', () => {
  it('lets the sender delete without consulting canModerate', async () => {
    const repo = new FakeMessageRepo();
    const id = '11111111-1111-1111-1111-111111111111';
    seedMessage(repo, id);
    const canModerate = vi.fn(async () => false);
    await new DeleteMessageHandler(repo, canModerate).execute(new DeleteMessageCommand(id, SENDER));
    expect(canModerate).not.toHaveBeenCalled();
    expect(repo.saved[0]?.isDeleted).toBe(true);
  });

  it('consults canModerate for a non-sender and allows a moderator', async () => {
    const repo = new FakeMessageRepo();
    const id = '11111111-1111-1111-1111-111111111111';
    seedMessage(repo, id, SENDER);
    const canModerate = vi.fn(async () => true);
    await new DeleteMessageHandler(repo, canModerate).execute(new DeleteMessageCommand(id, OTHER));
    expect(canModerate).toHaveBeenCalledOnce();
    expect(repo.saved[0]?.isDeleted).toBe(true);
  });

  it('rejects a non-sender who is not a moderator', async () => {
    const repo = new FakeMessageRepo();
    const id = '11111111-1111-1111-1111-111111111111';
    seedMessage(repo, id, SENDER);
    const canModerate = vi.fn(async () => false);
    await expect(
      new DeleteMessageHandler(repo, canModerate).execute(new DeleteMessageCommand(id, OTHER)),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('ReportMessageHandler', () => {
  it('files a report through the repository', async () => {
    const repo = new FakeMessageRepo();
    await new ReportMessageHandler(repo).execute(new ReportMessageCommand('msg-1', OTHER, 'spam'));
    expect(repo.reports).toEqual([{ messageId: 'msg-1', reporterId: OTHER, reason: 'spam' }]);
  });
});

describe('OpenConversationHandler', () => {
  it('returns the get-or-create room id', async () => {
    const out = await new OpenConversationHandler(new FakeConversationRepo()).execute(
      new OpenConversationCommand('team' satisfies RoomKind, 'team-1'),
    );
    expect(out.id).toBe(CID);
  });
});
