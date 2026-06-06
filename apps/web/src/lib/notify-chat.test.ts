import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `notifyChatMessage` closes the ADR 0028 gap where new chat messages pinged
 * nobody. These pin the decisions that would silently regress: DMs notify the
 * *other* participant (never the sender); rooms fan out to the membership the
 * `list_room_recipients` RPC resolves; and both coalesce a back-and-forth (or a
 * busy room) so a thread pings each person once. Supabase + the `notify`
 * fan-out are mocked at the module boundary so no IO happens.
 */
const h = vi.hoisted(() => ({
  adminFactory: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@pickupvb/supabase', () => ({ createSupabaseAdminClient: h.adminFactory }));
vi.mock('@/lib/notify', () => ({ notify: h.notify }));

import { notifyChatMessage, buildPreview } from './notify-chat';

type Canned = {
  participants: { user_id: string }[];
  sender: { display_name: string | null } | null;
  /** Recipients with an unread ping already waiting (batched coalesce). */
  pending: { user_id: string }[];
  /** Room recipients the RPC resolves. */
  roomRecipients: { user_id: string }[];
};

function fakeAdmin(canned: Canned) {
  function builder(data: unknown) {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ['select', 'eq', 'neq', 'is', 'gte', 'in', 'limit']) b[m] = chain;
    b['maybeSingle'] = () => Promise.resolve({ data, error: null });
    b['then'] = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(onF, onR);
    return b;
  }
  return {
    from: (table: string) => {
      if (table === 'conversation_participants') return builder(canned.participants);
      if (table === 'profiles_public') return builder(canned.sender);
      if (table === 'notifications') return builder(canned.pending);
      return builder(null);
    },
    rpc: (_name: string, _args: unknown) =>
      Promise.resolve({ data: canned.roomRecipients, error: null }),
  };
}

function setCanned(canned: Partial<Canned>) {
  h.adminFactory.mockReturnValue(
    fakeAdmin({ participants: [], sender: null, pending: [], roomRecipients: [], ...canned }),
  );
}

beforeEach(() => {
  h.notify.mockReset();
  h.notify.mockResolvedValue(undefined);
  h.adminFactory.mockReset();
});

describe('buildPreview', () => {
  it('falls back to a photo placeholder for an attachment-only message', () => {
    expect(buildPreview('   ', 2)).toBe('📷 Photo');
    expect(buildPreview('', 0)).toBe('');
  });

  it('truncates long bodies with an ellipsis', () => {
    const long = 'a'.repeat(300);
    const out = buildPreview(long, 0);
    expect(out.length).toBe(140);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('notifyChatMessage — DMs', () => {
  it('notifies the other DM participant (not the sender) with a preview + idempotency key', async () => {
    setCanned({ participants: [{ user_id: 'recipient' }], sender: { display_name: 'Pat' } });
    await notifyChatMessage({
      conversationId: 'c1',
      senderId: 'sender',
      body: 'see you at 6',
      attachmentsCount: 0,
      kind: 'dm',
    });
    expect(h.notify).toHaveBeenCalledTimes(1);
    const [kind, userId, payload, opts] = h.notify.mock.calls[0]!;
    expect(kind).toBe('chat.message.received');
    expect(userId).toBe('recipient');
    expect(payload).toMatchObject({
      senderId: 'sender',
      senderName: 'Pat',
      preview: 'see you at 6',
    });
    expect(opts?.idempotencyKey).toContain('c1:recipient:');
  });

  it('coalesces: skips when an unread ping for the thread already exists', async () => {
    setCanned({
      participants: [{ user_id: 'recipient' }],
      sender: { display_name: 'Pat' },
      pending: [{ user_id: 'recipient' }],
    });
    await notifyChatMessage({
      conversationId: 'c1',
      senderId: 'sender',
      body: 'another line',
      attachmentsCount: 0,
      kind: 'dm',
    });
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('falls back to "Someone" when the sender card is missing', async () => {
    setCanned({ participants: [{ user_id: 'recipient' }], sender: null });
    await notifyChatMessage({
      conversationId: 'c1',
      senderId: 'sender',
      body: 'hello',
      attachmentsCount: 0,
      kind: 'dm',
    });
    const [, , payload] = h.notify.mock.calls[0]!;
    expect((payload as { senderName: string }).senderName).toBe('Someone');
  });
});

describe('notifyChatMessage — rooms', () => {
  it('fans out to every room recipient the RPC resolves', async () => {
    setCanned({
      roomRecipients: [{ user_id: 'a' }, { user_id: 'b' }],
      sender: { display_name: 'Captain' },
    });
    await notifyChatMessage({
      conversationId: 'room1',
      senderId: 'sender',
      body: 'practice moved to 7',
      attachmentsCount: 0,
      kind: 'team',
    });
    expect(h.notify).toHaveBeenCalledTimes(2);
    expect(h.notify.mock.calls.map((c) => c[1])).toEqual(['a', 'b']);
  });

  it('coalesces per recipient: skips those with an unread ping already waiting', async () => {
    setCanned({
      roomRecipients: [{ user_id: 'a' }, { user_id: 'b' }],
      pending: [{ user_id: 'a' }],
      sender: { display_name: 'Captain' },
    });
    await notifyChatMessage({
      conversationId: 'room1',
      senderId: 'sender',
      body: 'another line',
      attachmentsCount: 0,
      kind: 'event',
    });
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0]![1]).toBe('b');
  });

  it('does nothing when the room has no other recipients', async () => {
    setCanned({ roomRecipients: [] });
    await notifyChatMessage({
      conversationId: 'room1',
      senderId: 'sender',
      body: 'hi',
      attachmentsCount: 0,
      kind: 'group',
    });
    expect(h.notify).not.toHaveBeenCalled();
  });
});
