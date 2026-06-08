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
  vi.fn<() => Promise<{ allowed: boolean; retryAfterSeconds: number }>>();
vi.mock('@/lib/rate-limit', () => ({
  consumeRateLimit: () => consumeRateLimitMock(),
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

describe('sendChatMessage — chat-attachment upload cap (R-2 Path A cost-control)', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    consumeRateLimitMock.mockReset();
    sendMessageExecute.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', is_anonymous: false } } });
    sendMessageExecute.mockResolvedValue({ id: 'm1', body: 'hello' });
    consumeRateLimitMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  it('never throttles a text-only message', async () => {
    const res = await sendChatMessage('c1', 'hello', []);
    expect(res).toEqual({ ok: true, value: { id: 'm1' } });
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(sendMessageExecute).toHaveBeenCalledOnce();
  });

  it('consumes the limiter for an image-bearing message and still sends when allowed', async () => {
    const res = await sendChatMessage('c1', '', [image]);
    expect(res.ok).toBe(true);
    expect(consumeRateLimitMock).toHaveBeenCalledOnce();
    expect(sendMessageExecute).toHaveBeenCalledOnce();
  });

  it('rejects an image-bearing message over the cap without ever calling the handler', async () => {
    consumeRateLimitMock.mockResolvedValue({ allowed: false, retryAfterSeconds: 3600 });
    const res = await sendChatMessage('c1', 'pics', [image]);
    expect(res).toEqual({ ok: false, error: 'rate_limited' });
    expect(sendMessageExecute).not.toHaveBeenCalled();
  });
});
