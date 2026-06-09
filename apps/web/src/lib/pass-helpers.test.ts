import { describe, expect, it } from 'vitest';
import {
  computePassExpiresAt,
  creditsRemaining,
  isPassExpired,
  isPassRedeemable,
  perSessionCents,
  type PassBalance,
} from './pass-helpers';

describe('creditsRemaining', () => {
  it('subtracts used from total', () => {
    expect(creditsRemaining(10, 3)).toBe(7);
  });
  it('never goes negative if the counter drifts past total', () => {
    expect(creditsRemaining(10, 12)).toBe(0);
  });
  it('is the full count when none used', () => {
    expect(creditsRemaining(10, 0)).toBe(10);
  });
});

describe('computePassExpiresAt', () => {
  it('returns null for a never-expiring pass', () => {
    expect(computePassExpiresAt('2026-06-08T00:00:00.000Z', null)).toBeNull();
  });
  it('adds the day window to the paid-at instant', () => {
    expect(computePassExpiresAt('2026-06-08T00:00:00.000Z', 30)).toBe('2026-07-08T00:00:00.000Z');
  });
  it('returns null for an unparseable paid-at', () => {
    expect(computePassExpiresAt('not-a-date', 30)).toBeNull();
  });
});

describe('isPassExpired', () => {
  const now = Date.parse('2026-07-01T00:00:00.000Z');
  it('a null expiry never expires', () => {
    expect(isPassExpired(null, now)).toBe(false);
  });
  it('is true once now passes the expiry', () => {
    expect(isPassExpired('2026-06-30T00:00:00.000Z', now)).toBe(true);
  });
  it('is false while still inside the window', () => {
    expect(isPassExpired('2026-07-02T00:00:00.000Z', now)).toBe(false);
  });
});

describe('isPassRedeemable', () => {
  const now = Date.parse('2026-07-01T00:00:00.000Z');
  const base: PassBalance = {
    creditsTotal: 10,
    creditsUsed: 2,
    paymentStatus: 'paid',
    expiresAt: '2026-12-01T00:00:00.000Z',
  };
  it('is redeemable when paid, has credits, not expired', () => {
    expect(isPassRedeemable(base, now)).toBe(true);
  });
  it('is not redeemable when unpaid (pending purchase)', () => {
    expect(isPassRedeemable({ ...base, paymentStatus: 'pending' }, now)).toBe(false);
  });
  it('is not redeemable when all credits are used', () => {
    expect(isPassRedeemable({ ...base, creditsUsed: 10 }, now)).toBe(false);
  });
  it('is not redeemable once expired', () => {
    expect(isPassRedeemable({ ...base, expiresAt: '2026-06-01T00:00:00.000Z' }, now)).toBe(false);
  });
});

describe('perSessionCents', () => {
  it('divides price across credits, rounded', () => {
    expect(perSessionCents(8000, 10)).toBe(800);
    expect(perSessionCents(10000, 3)).toBe(3333);
  });
  it('falls back to the full price for a zero credit count', () => {
    expect(perSessionCents(5000, 0)).toBe(5000);
  });
});
