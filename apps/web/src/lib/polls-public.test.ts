import { describe, it, expect, vi, beforeEach } from 'vitest';

// `polls-public.ts` is 'server-only' and pulls in the rate-limiter (admin
// client) + turnstile. Mock at the module boundaries so the unit under test is
// just the submit orchestration: gate on turnstile → gate on rate limit → call
// the RPC and map its result/errors.
vi.mock('server-only', () => ({}));

const verifyTurnstileMock =
  vi.fn<(t: string | null | undefined) => Promise<{ ok: boolean; error?: string }>>();
vi.mock('./turnstile', () => ({
  verifyTurnstileToken: (t: string | null | undefined) => verifyTurnstileMock(t),
}));

const consumeMock = vi.fn<() => Promise<{ allowed: boolean; retryAfterSeconds: number }>>();
vi.mock('./rate-limit', () => ({
  consumeRateLimit: () => consumeMock(),
  getClientIp: async () => '1.2.3.4',
  rateLimitKey: (scope: string, dim: string, val: string) => `${scope}:${dim}:${val}`,
}));

const rpcMock = vi.fn();
vi.mock('./supabase', () => ({
  getServerSupabase: async () => ({ rpc: rpcMock }),
}));

vi.mock('@pickupvb/supabase', () => ({
  createSupabaseAnonClient: () => ({ rpc: vi.fn() }),
}));

// The first-response ping reads the creator on the admin client and calls
// `notify` — mock both so the unit stays about the submit orchestration.
const adminMaybeSingle = vi.fn<() => Promise<{ data: unknown }>>();
vi.mock('./supabase-admin', () => ({
  getAdminSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: adminMaybeSingle }) }) }),
  }),
}));

const notifyMock = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('./notify', () => ({ notify: (...args: unknown[]) => notifyMock(...args) }));

const { submitPollResponse } = await import('./polls-public');

const validInput = {
  code: 'ABCD1234',
  name: '  Zed  ',
  anonToken: 'tok-1',
  answers: [{ questionId: 'q1', optionIds: ['o1'] }],
  turnstileToken: 'tk',
};

beforeEach(() => {
  vi.clearAllMocks();
  verifyTurnstileMock.mockResolvedValue({ ok: true });
  consumeMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  rpcMock.mockResolvedValue({ data: { response_id: 'r-1' }, error: null });
  adminMaybeSingle.mockResolvedValue({ data: { creator_id: 'host-1', title: 'My poll' } });
  notifyMock.mockResolvedValue(undefined);
});

describe('submitPollResponse', () => {
  it('trims the name and maps answers to the RPC arg shape on the happy path', async () => {
    const result = await submitPollResponse(validInput);
    expect(result).toEqual({ ok: true, responseId: 'r-1' });
    expect(rpcMock).toHaveBeenCalledWith('submit_poll_response', {
      p_code: 'ABCD1234',
      p_name: 'Zed',
      p_anon_token: 'tok-1',
      p_answers: [{ question_id: 'q1', option_ids: ['o1'] }],
    });
  });

  it('rejects an empty name before touching turnstile or the RPC', async () => {
    const result = await submitPollResponse({ ...validInput, name: '   ' });
    expect(result.ok).toBe(false);
    expect(verifyTurnstileMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('blocks when turnstile verification fails, without calling the RPC', async () => {
    verifyTurnstileMock.mockResolvedValue({ ok: false, error: 'Are you human?' });
    const result = await submitPollResponse(validInput);
    expect(result).toEqual({ ok: false, error: 'Are you human?' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('blocks when rate-limited and surfaces the retry hint, without calling the RPC', async () => {
    consumeMock.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const result = await submitPollResponse(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryAfterSeconds).toBe(42);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('maps a "poll is closed" RPC error to a friendly message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'poll is closed' } });
    const result = await submitPollResponse(validInput);
    expect(result).toEqual({ ok: false, error: 'This poll has closed.' });
  });

  it('notifies the creator once when the RPC reports the first response', async () => {
    rpcMock.mockResolvedValue({
      data: { response_id: 'r-1', poll_id: 'poll-9', is_first_response: true },
      error: null,
    });
    const result = await submitPollResponse(validInput);
    expect(result).toEqual({ ok: true, responseId: 'r-1' });
    expect(notifyMock).toHaveBeenCalledWith(
      'poll.first_response',
      'host-1',
      { pollId: 'poll-9', pollTitle: 'My poll', firstResponderName: 'Zed' },
      { idempotencyKey: 'poll-first:poll-9' },
    );
  });

  it('does not notify when the response is not the first', async () => {
    rpcMock.mockResolvedValue({
      data: { response_id: 'r-2', poll_id: 'poll-9', is_first_response: false },
      error: null,
    });
    await submitPollResponse(validInput);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
