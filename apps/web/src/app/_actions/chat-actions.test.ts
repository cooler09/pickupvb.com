import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MessageAttachment } from '@pickupvb/domain';

// Isolate the send action from Supabase auth, the chat handlers, and the
// rate-limit primitive so we can pin the R-2 Path A cost-control behavior:
// image-bearing sends consume the per-user/day limiter, text sends never do.
const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getServerSupabase: async () => ({ auth: { getUser: getUserMock } }),
}));

const consumeRateLimitMock =
  vi.fn<(args: { key: string }) => Promise<{ allowed: boolean; retryAfterSeconds: number }>>();
vi.mock('@/lib/rate-limit', () => ({
  consumeRateLimit: (args: { key: string }) => consumeRateLimitMock(args),
  rateLimitKey: (scope: string, dim: string, val: string) => `${scope}:${dim}:${val}`,
}));

const sendMessageExecute = vi.fn<() => Promise<{ id: string; body: string }>>();
vi.mock('@/lib/handlers', () => ({
  getChatHandlers: async () => ({ sendMessage: { execute: sendMessageExecute } }),
}));

// Imported at module top; never exercised in these cases — stub so the import graph resolves.
vi.mock('@pickupvb/infrastructure', () => ({ SupabaseUserBlockRepository: class {} }));

import { sendChatMessage } from './chat-actions';

const image: MessageAttachment = {
  bucket: 'chat-attachments',
  path: 'conv/user/x.png',
  width: 10,
  height: 10,
  mime: 'image/png',
  size: 1234,
};

describe('sendChatMessage — rate limits (general message cap + R-2 attachment cap)', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    consumeRateLimitMock.mockReset();
    sendMessageExecute.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', is_anonymous: false } } });
    sendMessageExecute.mockResolvedValue({ id: 'm1', body: 'hello' });
    consumeRateLimitMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  it('throttles a text-only send through the general message cap only', async () => {
    const res = await sendChatMessage('c1', 'hello', []);
    expect(res).toEqual({ ok: true, value: { id: 'm1' } });
    // The general per-message cap is consumed; the attachment/day cap is not.
    expect(consumeRateLimitMock).toHaveBeenCalledOnce();
    expect(consumeRateLimitMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'chat-msg:user:u1' }),
    );
    expect(sendMessageExecute).toHaveBeenCalledOnce();
  });

  it('consumes both the message cap and the attachment cap for an image-bearing send', async () => {
    const res = await sendChatMessage('c1', '', [image]);
    expect(res.ok).toBe(true);
    expect(consumeRateLimitMock).toHaveBeenCalledTimes(2);
    const keys = consumeRateLimitMock.mock.calls.map(([a]) => a.key);
    expect(keys).toContain('chat-msg:user:u1');
    expect(keys).toContain('chat-attach:user:u1');
    expect(sendMessageExecute).toHaveBeenCalledOnce();
  });

  it('rejects a send over the general message cap before the handler or attachment cap', async () => {
    consumeRateLimitMock.mockImplementation(async (args) => ({
      allowed: args.key !== 'chat-msg:user:u1',
      retryAfterSeconds: 60,
    }));
    const res = await sendChatMessage('c1', 'spam', []);
    expect(res).toEqual({ ok: false, error: 'rate_limited' });
    expect(sendMessageExecute).not.toHaveBeenCalled();
  });

  it('rejects an image-bearing send over the attachment cap without calling the handler', async () => {
    consumeRateLimitMock.mockImplementation(async (args) => ({
      allowed: args.key !== 'chat-attach:user:u1',
      retryAfterSeconds: 3600,
    }));
    const res = await sendChatMessage('c1', 'pics', [image]);
    expect(res).toEqual({ ok: false, error: 'rate_limited' });
    expect(sendMessageExecute).not.toHaveBeenCalled();
  });
});
