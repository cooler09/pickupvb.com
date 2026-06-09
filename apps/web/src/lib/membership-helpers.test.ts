import { describe, expect, it } from 'vitest';
import { isMembershipActive } from './membership-helpers';

describe('isMembershipActive', () => {
  const now = Date.parse('2026-07-01T00:00:00.000Z');

  it('trialing is active', () => {
    expect(isMembershipActive({ status: 'trialing', currentPeriodEnd: null }, now)).toBe(true);
  });
  it('active is active', () => {
    expect(isMembershipActive({ status: 'active', currentPeriodEnd: null }, now)).toBe(true);
  });
  it('canceled is not active', () => {
    expect(isMembershipActive({ status: 'canceled', currentPeriodEnd: null }, now)).toBe(false);
  });
  it('past_due within the 30-day grace is active', () => {
    expect(
      isMembershipActive({ status: 'past_due', currentPeriodEnd: '2026-06-20T00:00:00.000Z' }, now),
    ).toBe(true);
  });
  it('past_due past the 30-day grace is not active', () => {
    expect(
      isMembershipActive({ status: 'past_due', currentPeriodEnd: '2026-05-01T00:00:00.000Z' }, now),
    ).toBe(false);
  });
  it('past_due with no period end is not active (cannot prove liveness)', () => {
    expect(isMembershipActive({ status: 'past_due', currentPeriodEnd: null }, now)).toBe(false);
  });
});
