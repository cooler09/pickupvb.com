import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `notifyChatMessage` closes the ADR 0028 gap where new chat messages pinged
 * nobody. These pin the decisions that matter and would silently regress: it
 * fires for DMs only, notifies the *other* participant (never the sender),
 * and coalesces a back-and-forth so a thread doesn't spam. Supabase + the
 * `notify` fan-out are mocked at the module boundary so no IO happens.
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
  recentUnread: { id: string }[];
};

function fakeAdmin(canned: Canned) {
  function builder(data: unknown) {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ['select', 'eq', 'neq', 'is', 'gte', 'limit']) b[m] = chain;
    b['maybeSingle'] = () => Promise.resolve({ data, error: null });
    b['then'] = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(onF, onR);
    return b;
  }
  return {
    from: (table: string) => {
      if (table === 'conversation_participants') return builder(canned.participants);
      if (table === 'profiles_public') return builder(canned.sender);
      if (table === 'notifications') return builder(canned.recentUnread);
      return builder(null);
    },
  };
}

function setCanned(canned: Canned) {
  h.adminFactory.mockReturnValue(fakeAdmin(canned));
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

describe('notifyChatMessage', () => {
  it('does nothing for room (non-dm) messages', async () => {
    setCanned({ participants: [], sender: null, recentUnread: [] });
    await notifyChatMessage({
      conversationId: 'c1',
      senderId: 's1',
      body: 'hi team',
      attachmentsCount: 0,
      kind: 'team',
    });
    expect(h.notify).not.toHaveBeenCalled();
    // Returns before ever constructing the admin client.
    expect(h.adminFactory).not.toHaveBeenCalled();
  });

  it('notifies the other DM participant (not the sender) with a preview + idempotency key', async () => {
    setCanned({
      participants: [{ user_id: 'recipient' }],
      sender: { display_name: 'Pat' },
      recentUnread: [],
    });
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
      conversationId: 'c1',
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
      recentUnread: [{ id: 'existing' }],
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
    setCanned({
      participants: [{ user_id: 'recipient' }],
      sender: null,
      recentUnread: [],
    });
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
