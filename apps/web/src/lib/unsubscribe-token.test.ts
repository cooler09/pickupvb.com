import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token';

/**
 * The one-click unsubscribe link (RFC 8058) is unauthenticated — the HMAC token
 * is the *only* thing standing between a stranger and silencing someone else's
 * email. These pin that it round-trips its own userId, rejects any tamper or
 * wrong-secret token, and degrades to `null` (header omitted) when unconfigured.
 */
const ORIGINAL = process.env['CRON_SECRET'];

beforeEach(() => {
  process.env['CRON_SECRET'] = 'test-secret';
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env['CRON_SECRET'];
  else process.env['CRON_SECRET'] = ORIGINAL;
});

describe('unsubscribe token', () => {
  it('round-trips the userId', () => {
    const token = signUnsubscribeToken('user-123');
    expect(token).toBeTruthy();
    expect(verifyUnsubscribeToken(token)).toBe('user-123');
  });

  it('rejects a tampered userId or signature', () => {
    const token = signUnsubscribeToken('user-123')!;
    expect(verifyUnsubscribeToken(token.replace('user-123', 'user-999'))).toBeNull();
    expect(verifyUnsubscribeToken(`${token}x`)).toBeNull();
  });

  it('rejects malformed / empty tokens', () => {
    expect(verifyUnsubscribeToken(null)).toBeNull();
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken('no-signature')).toBeNull();
  });

  it('does not verify a token signed under a different secret', () => {
    const token = signUnsubscribeToken('user-123')!;
    process.env['CRON_SECRET'] = 'rotated-secret';
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it('degrades to null when no secret is configured', () => {
    delete process.env['CRON_SECRET'];
    expect(signUnsubscribeToken('user-123')).toBeNull();
    expect(verifyUnsubscribeToken('user-123.anything')).toBeNull();
  });
});
