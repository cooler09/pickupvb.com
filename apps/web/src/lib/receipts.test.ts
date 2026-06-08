import { describe, it, expect } from 'vitest';
import {
  groupAuditRowsByPaymentIntent,
  estimatePlatformFeeCents,
  type AuditLedgerRow,
} from './receipts';

type Row = AuditLedgerRow & { title: string | null };

function row(over: Partial<Row> = {}): Row {
  return {
    id: 'a1',
    event_id: 'e1',
    user_id: 'u1',
    action: 'paid',
    amount_cents: 1000,
    payment_intent_id: 'pi_1',
    off_platform: false,
    occurred_at: '2026-06-01T00:00:00.000Z',
    title: 'Beach Bash',
    ...over,
  };
}

const project = (r: Row) => (r.title ? { eventId: r.event_id, eventTitle: r.title } : null);

describe('groupAuditRowsByPaymentIntent', () => {
  it('folds a lone paid row into one transaction', () => {
    const txns = groupAuditRowsByPaymentIntent([row()], project);
    expect(txns).toEqual([
      {
        paymentIntentId: 'pi_1',
        paidCents: 1000,
        refundedCents: 0,
        netCents: 1000,
        paidAt: '2026-06-01T00:00:00.000Z',
        refundedAt: null,
        offPlatform: false,
        eventId: 'e1',
        eventTitle: 'Beach Bash',
      },
    ]);
  });

  it('nets a paid + refund on the same payment intent into one transaction', () => {
    const txns = groupAuditRowsByPaymentIntent(
      [
        row({ id: 'a1', action: 'paid', amount_cents: 1000 }),
        row({
          id: 'a2',
          action: 'refunded',
          amount_cents: 400,
          occurred_at: '2026-06-03T00:00:00.000Z',
        }),
      ],
      project,
    );
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({
      paidCents: 1000,
      refundedCents: 400,
      netCents: 600,
      paidAt: '2026-06-01T00:00:00.000Z',
      refundedAt: '2026-06-03T00:00:00.000Z',
    });
  });

  it('keeps distinct payment intents as separate transactions', () => {
    const txns = groupAuditRowsByPaymentIntent(
      [row({ payment_intent_id: 'pi_1' }), row({ id: 'a2', payment_intent_id: 'pi_2' })],
      project,
    );
    expect(txns.map((t) => t.paymentIntentId)).toEqual(['pi_1', 'pi_2']);
  });

  it('gives each null-payment-intent row its own synthetic audit:<id> key', () => {
    const txns = groupAuditRowsByPaymentIntent(
      [row({ id: 'a1', payment_intent_id: null }), row({ id: 'a2', payment_intent_id: null })],
      project,
    );
    expect(txns.map((t) => t.paymentIntentId)).toEqual(['audit:a1', 'audit:a2']);
  });

  it('takes the earliest paidAt and latest refundedAt regardless of input order', () => {
    const txns = groupAuditRowsByPaymentIntent(
      [
        row({ id: 'a1', action: 'paid', occurred_at: '2026-06-05T00:00:00.000Z' }),
        row({ id: 'a2', action: 'paid', occurred_at: '2026-06-02T00:00:00.000Z' }),
        row({ id: 'a3', action: 'refunded', occurred_at: '2026-06-06T00:00:00.000Z' }),
        row({ id: 'a4', action: 'refunded', occurred_at: '2026-06-09T00:00:00.000Z' }),
      ],
      project,
    );
    expect(txns[0]).toMatchObject({
      paidAt: '2026-06-02T00:00:00.000Z',
      refundedAt: '2026-06-09T00:00:00.000Z',
      paidCents: 2000,
      refundedCents: 2000,
      netCents: 0,
    });
  });

  it('skips rows where the projection returns null (missing !inner join)', () => {
    const txns = groupAuditRowsByPaymentIntent(
      [row({ title: null }), row({ id: 'a2', payment_intent_id: 'pi_2' })],
      project,
    );
    expect(txns.map((t) => t.paymentIntentId)).toEqual(['pi_2']);
  });

  it('nets an off-platform (cash) paid + later refund by (event, user) — not two rows (R-6)', () => {
    const txns = groupAuditRowsByPaymentIntent(
      [
        row({ id: 'c1', payment_intent_id: null, off_platform: true, action: 'paid' }),
        row({
          id: 'c2',
          payment_intent_id: null,
          off_platform: true,
          action: 'refunded',
          occurred_at: '2026-06-04T00:00:00.000Z',
        }),
      ],
      project,
    );
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({
      paymentIntentId: 'cash:e1:u1',
      paidCents: 1000,
      refundedCents: 1000,
      netCents: 0,
      offPlatform: true,
    });
  });

  it('keeps cash payments from different payers on one event separate', () => {
    const txns = groupAuditRowsByPaymentIntent(
      [
        row({ id: 'c1', payment_intent_id: null, off_platform: true, user_id: 'uA' }),
        row({ id: 'c2', payment_intent_id: null, off_platform: true, user_id: 'uB' }),
      ],
      project,
    );
    expect(txns.map((t) => t.paymentIntentId)).toEqual(['cash:e1:uA', 'cash:e1:uB']);
  });

  it('projects static fields from the first row seen for a key', () => {
    const txns = groupAuditRowsByPaymentIntent(
      [
        row({ id: 'a1', title: 'First' }),
        row({ id: 'a2', action: 'refunded', amount_cents: 100, title: 'Second' }),
      ],
      project,
    );
    expect(txns[0]?.eventTitle).toBe('First');
  });
});

describe('estimatePlatformFeeCents', () => {
  it('applies the rate and rounds to the nearest cent', () => {
    expect(estimatePlatformFeeCents(1000, 0.05)).toBe(50);
    expect(estimatePlatformFeeCents(1000, 0.025)).toBe(25);
    expect(estimatePlatformFeeCents(999, 0.05)).toBe(50); // 49.95 → 50
  });

  it('is zero for a zero net', () => {
    expect(estimatePlatformFeeCents(0, 0.05)).toBe(0);
  });
});
