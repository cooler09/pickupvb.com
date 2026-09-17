import { describe, it, expect } from 'vitest';

import {
  isNewHostAccount,
  NEW_HOST_WINDOW_DAYS,
  NEW_HOST_EVENT_CHECKOUTS_PER_HOUR,
  NEW_HOST_EVENT_CHECKOUTS_PER_DAY,
} from './new-host-policy';

/**
 * These caps are the anti-abuse posture from the 2026-09-14→17 card-testing
 * incident, where the operator went signup → charging stolen cards in 8–10
 * minutes while passing every identity check (email verification via iCloud
 * relay aliases, Stripe KYC in under a minute).
 *
 * The fail-closed behaviour is the load-bearing part. If anyone "tidies"
 * `isNewHostAccount` so that an unknown age means *established*, an attacker who
 * can suppress or corrupt the profile read gets an uncapped event — which is the
 * exact hole this module exists to close.
 */
const NOW = new Date('2026-09-17T12:00:00Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('unproven-host window', () => {
  it('treats an account created minutes ago as new — the incident signature', () => {
    // The real accounts were charging 8–10 minutes after signup.
    expect(isNewHostAccount(new Date(NOW.getTime() - 9 * 60 * 1000).toISOString(), NOW)).toBe(true);
  });

  it('treats an account just inside the window as new', () => {
    expect(isNewHostAccount(daysAgo(NEW_HOST_WINDOW_DAYS - 0.01), NOW)).toBe(true);
  });

  it('treats an account past the window as established', () => {
    expect(isNewHostAccount(daysAgo(NEW_HOST_WINDOW_DAYS + 1), NOW)).toBe(false);
  });

  it('fails CLOSED on a missing age rather than waving the host through', () => {
    expect(isNewHostAccount(null, NOW)).toBe(true);
    expect(isNewHostAccount(undefined, NOW)).toBe(true);
  });

  it('fails CLOSED on an unparseable timestamp', () => {
    expect(isNewHostAccount('not-a-date', NOW)).toBe(true);
    expect(isNewHostAccount('', NOW)).toBe(true);
  });

  it('fails CLOSED on a future timestamp instead of trusting it', () => {
    expect(isNewHostAccount(new Date(NOW.getTime() + 86_400_000).toISOString(), NOW)).toBe(true);
  });
});

describe('cap calibration', () => {
  it('sits an order of magnitude below the observed attack rate', () => {
    // The attack drove 27–30 paid checkout sessions through one event in ~1 hour.
    const OBSERVED_ATTACK_SESSIONS_PER_HOUR = 27;
    expect(NEW_HOST_EVENT_CHECKOUTS_PER_HOUR).toBeLessThan(OBSERVED_ATTACK_SESSIONS_PER_HOUR / 5);
  });

  it('stays above plausible organic demand for a first open play', () => {
    // A genuine first-time host fills ~8–12 signups spread over days, so the
    // daily ceiling must comfortably clear a full event.
    expect(NEW_HOST_EVENT_CHECKOUTS_PER_DAY).toBeGreaterThan(12);
  });

  it('keeps the daily ceiling above the hourly one', () => {
    expect(NEW_HOST_EVENT_CHECKOUTS_PER_DAY).toBeGreaterThan(NEW_HOST_EVENT_CHECKOUTS_PER_HOUR);
  });
});
