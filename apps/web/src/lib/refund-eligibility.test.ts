import { describe, expect, it } from 'vitest';
import { refundBlockReason } from './refund-eligibility';

// starts_at = T+48h; a 24h window means the cutoff is at T+24h.
const STARTS_AT = 48 * 60 * 60 * 1000;
const base = {
  paymentStatus: 'paid' as const,
  viaStripe: true,
  hostStripeReady: true,
  startsAtMs: STARTS_AT,
  refundWindowHours: 24,
  nowMs: 0,
};

describe('refundBlockReason', () => {
  it('returns null when the attendee is fully refundable (online, host ready, within window)', () => {
    expect(refundBlockReason(base)).toBeNull();
  });

  it('never blocks a non-paid attendee', () => {
    expect(refundBlockReason({ ...base, paymentStatus: 'pending', viaStripe: false })).toBeNull();
    expect(refundBlockReason({ ...base, paymentStatus: 'none', viaStripe: false })).toBeNull();
    expect(refundBlockReason({ ...base, paymentStatus: undefined, viaStripe: false })).toBeNull();
  });

  it('blocks an off-platform paid attendee (no Stripe charge to reverse)', () => {
    expect(refundBlockReason({ ...base, viaStripe: false })).toBe('off_platform');
  });

  it('blocks when the host has no charges-enabled Connect account', () => {
    expect(refundBlockReason({ ...base, hostStripeReady: false })).toBe('host_not_ready');
  });

  it('blocks once now passes starts_at − refund_window_hours', () => {
    // 1ms past the T+24h cutoff.
    expect(refundBlockReason({ ...base, nowMs: STARTS_AT - 24 * 60 * 60 * 1000 + 1 })).toBe(
      'window_closed',
    );
  });

  it('still allows a refund exactly at the cutoff boundary', () => {
    expect(refundBlockReason({ ...base, nowMs: STARTS_AT - 24 * 60 * 60 * 1000 })).toBeNull();
  });

  it('prioritises off_platform over host/window reasons', () => {
    expect(
      refundBlockReason({ ...base, viaStripe: false, hostStripeReady: false, nowMs: STARTS_AT }),
    ).toBe('off_platform');
  });
});
