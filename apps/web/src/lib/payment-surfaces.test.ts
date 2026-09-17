import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { isTippingEnabled, isTicketCheckoutEnabled } from './payment-surfaces';

/**
 * These switches exist because tips were used to launder stolen cards through
 * Connect accounts while the platform carried the chargeback liability (see
 * `.scratch/tip-fraud-response/map.md`).
 *
 * The default-off semantics are the load-bearing part: if anyone relaxes
 * `=== 'true'` into a truthy check, or flips tips to opt-out "for convenience",
 * a deploy that looks like a fix would leave the surface live. These tests fail
 * first in that case.
 */
const ORIGINAL_TIPS = process.env['TIPS_ENABLED'];
const ORIGINAL_TICKETS = process.env['TICKET_CHECKOUT_DISABLED'];

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  delete process.env['TIPS_ENABLED'];
  delete process.env['TICKET_CHECKOUT_DISABLED'];
});
afterEach(() => {
  restore('TIPS_ENABLED', ORIGINAL_TIPS);
  restore('TICKET_CHECKOUT_DISABLED', ORIGINAL_TICKETS);
});

describe('tipping kill switch', () => {
  it('stays off when TIPS_ENABLED is unset, so the deploy alone stops the bleeding', () => {
    expect(isTippingEnabled()).toBe(false);
  });

  it('stays off for any value that is not the exact string "true"', () => {
    for (const value of ['', 'false', 'TRUE', 'True', '1', 'yes', 'enabled', ' true']) {
      process.env['TIPS_ENABLED'] = value;
      expect(isTippingEnabled()).toBe(false);
    }
  });

  it('turns on only for the exact string "true"', () => {
    process.env['TIPS_ENABLED'] = 'true';
    expect(isTippingEnabled()).toBe(true);
  });
});

describe('ticket checkout kill switch', () => {
  it('stays ON by default, so shipping the tip kill switch cannot take the business offline', () => {
    expect(isTicketCheckoutEnabled()).toBe(true);
  });

  it('kills ticket checkout on the exact string "true"', () => {
    process.env['TICKET_CHECKOUT_DISABLED'] = 'true';
    expect(isTicketCheckoutEnabled()).toBe(false);
  });

  it('ignores near-misses rather than silently taking payments offline', () => {
    for (const value of ['', 'false', 'TRUE', '1', 'yes']) {
      process.env['TICKET_CHECKOUT_DISABLED'] = value;
      expect(isTicketCheckoutEnabled()).toBe(true);
    }
  });
});
