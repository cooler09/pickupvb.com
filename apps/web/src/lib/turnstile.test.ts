import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { verifyTurnstileToken } from './turnstile';

const ORIGINAL_SECRET = process.env['TURNSTILE_SECRET_KEY'];

function mockFetchOnce(json: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(json), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}

describe('verifyTurnstileToken', () => {
  beforeEach(() => {
    process.env['TURNSTILE_SECRET_KEY'] = 'test-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_SECRET === undefined) delete process.env['TURNSTILE_SECRET_KEY'];
    else process.env['TURNSTILE_SECRET_KEY'] = ORIGINAL_SECRET;
  });

  it('returns ok when Cloudflare reports success with a fresh challenge_ts', async () => {
    mockFetchOnce({ success: true, challenge_ts: new Date().toISOString() });
    const result = await verifyTurnstileToken('tok');
    expect(result.ok).toBe(true);
  });

  it('returns ok when Cloudflare omits challenge_ts', async () => {
    mockFetchOnce({ success: true });
    const result = await verifyTurnstileToken('tok');
    expect(result.ok).toBe(true);
  });

  it('rejects tokens older than the max age window', async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    mockFetchOnce({ success: true, challenge_ts: stale });
    const result = await verifyTurnstileToken('tok');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it('rejects when Cloudflare reports failure', async () => {
    mockFetchOnce({ success: false, 'error-codes': ['invalid-input-response'] });
    const result = await verifyTurnstileToken('tok');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Verification failed/);
  });

  it('rejects a missing token', async () => {
    const result = await verifyTurnstileToken('');
    expect(result.ok).toBe(false);
  });
});
