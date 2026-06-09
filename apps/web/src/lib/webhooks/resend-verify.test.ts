import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

import { verifyResendSignature } from './resend-verify';

/**
 * Audit P2 #3: the Resend webhook trusts the request only if the Svix signature
 * checks out. These pin the HMAC verification, the replay window, and the
 * failure modes — without it a forged POST could suppress arbitrary addresses.
 */
const SECRET = 'whsec_dGVzdHNlY3JldA=='; // base64 of "testsecret"

function sign(body: string, id: string, ts: number): string {
  const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return `v1,${sig}`;
}

describe('verifyResendSignature (audit P2 #3)', () => {
  const body = JSON.stringify({ type: 'email.bounced' });
  const id = 'msg_123';
  const now = new Date('2026-06-08T00:00:00.000Z');
  const ts = Math.floor(now.getTime() / 1000);

  it('accepts a correctly-signed payload', () => {
    const headers = { id, timestamp: String(ts), signature: sign(body, id, ts) };
    expect(verifyResendSignature(body, headers, SECRET, now)).toBe(true);
  });

  it('accepts when the header lists multiple space-separated signatures', () => {
    const headers = { id, timestamp: String(ts), signature: `v1a,bogus ${sign(body, id, ts)}` };
    expect(verifyResendSignature(body, headers, SECRET, now)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const headers = { id, timestamp: String(ts), signature: sign(body, id, ts) };
    expect(verifyResendSignature(`${body} `, headers, SECRET, now)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const headers = { id, timestamp: String(ts), signature: sign(body, id, ts) };
    expect(verifyResendSignature(body, headers, 'whsec_b3RoZXI=', now)).toBe(false);
  });

  it('rejects a stale timestamp (replay window)', () => {
    const old = ts - 10 * 60; // 10 min old, tolerance is 5
    const headers = { id, timestamp: String(old), signature: sign(body, id, old) };
    expect(verifyResendSignature(body, headers, SECRET, now)).toBe(false);
  });

  it('rejects missing headers', () => {
    expect(
      verifyResendSignature(body, { id: null, timestamp: null, signature: null }, SECRET, now),
    ).toBe(false);
  });
});
