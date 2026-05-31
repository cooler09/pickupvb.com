import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { sendEmail } from './email-resend';

/**
 * Pins the Resend idempotency contract (TPI-8). The cron worker can redeliver
 * an outbox row after a crash between the provider send and `markSent`; without
 * the `Idempotency-Key` header that retry would send a *duplicate* email. This
 * test fails if anyone drops the header forwarding.
 */
const ORIGINAL_KEY = process.env['RESEND_API_KEY'];

function mockFetchCapture(): { calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(init);
      return new Response(JSON.stringify({ id: 'email_123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return { calls };
}

const baseInput = {
  to: 'a@example.com',
  subject: 'Hi',
  html: '<p>Hi</p>',
  text: 'Hi',
};

describe('sendEmail idempotency', () => {
  beforeEach(() => {
    // A real key forces the live fetch path instead of the dev soft-fail.
    process.env['RESEND_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_KEY === undefined) delete process.env['RESEND_API_KEY'];
    else process.env['RESEND_API_KEY'] = ORIGINAL_KEY;
  });

  it('forwards the outbox row id as an Idempotency-Key header so a retried send is deduped by Resend', async () => {
    const { calls } = mockFetchCapture();
    await sendEmail({ ...baseInput, idempotencyKey: 'outbox_row_42' });
    expect(calls).toHaveLength(1);
    const headers = calls[0]!.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('outbox_row_42');
  });

  it('omits the Idempotency-Key header when no key is given', async () => {
    const { calls } = mockFetchCapture();
    await sendEmail(baseInput);
    const headers = calls[0]!.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeUndefined();
  });
});
