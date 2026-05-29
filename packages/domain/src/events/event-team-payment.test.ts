import { describe, expect, it } from 'vitest';
import { InvariantViolation } from '../shared/result.js';
import { EventTeamPayment, EventTeamPaymentId } from './event-team-payment.js';
import { RegistrationPaymentStatus } from './event-team-registration.js';
import { UserId } from './volleyball-event.js';

const ID = EventTeamPaymentId('p1');
const CAPTAIN = UserId('u1');

function fresh(): EventTeamPayment {
  return EventTeamPayment.create({
    id: ID,
    eventId: 'e1',
    teamId: 't1',
    captainId: CAPTAIN,
  });
}

describe('EventTeamPayment', () => {
  it('starts with None status and no payment fields', () => {
    const p = fresh();
    expect(p.paymentStatus).toBe(RegistrationPaymentStatus.None);
    expect(p.checkoutSessionId).toBeNull();
    expect(p.paymentIntentId).toBeNull();
    expect(p.amountPaidCents).toBeNull();
    expect(p.paidAt).toBeNull();
  });

  it('transitions None → Pending via markCheckoutPending', () => {
    const p = fresh();
    p.markCheckoutPending('cs_test_1');
    expect(p.paymentStatus).toBe(RegistrationPaymentStatus.Pending);
    expect(p.checkoutSessionId).toBe('cs_test_1');
  });

  it('rejects markCheckoutPending from non-None status', () => {
    const p = fresh();
    p.markCheckoutPending('cs_test_1');
    expect(() => p.markCheckoutPending('cs_test_2')).toThrow(InvariantViolation);
  });

  it('expireCheckout resets Pending → None and is a no-op otherwise', () => {
    const p = fresh();
    p.expireCheckout();
    expect(p.paymentStatus).toBe(RegistrationPaymentStatus.None);
    p.markCheckoutPending('cs_test');
    p.expireCheckout();
    expect(p.paymentStatus).toBe(RegistrationPaymentStatus.None);
    expect(p.checkoutSessionId).toBeNull();
  });

  it('markPaid sets payment fields and moves to Paid', () => {
    const p = fresh();
    p.markCheckoutPending('cs_test');
    const now = new Date('2026-06-01T12:00:00Z');
    p.markPaid({ paymentIntentId: 'pi_1', amountCents: 5000, paidAt: now });
    expect(p.paymentStatus).toBe(RegistrationPaymentStatus.Paid);
    expect(p.paymentIntentId).toBe('pi_1');
    expect(p.amountPaidCents).toBe(5000);
    expect(p.paidAt).toEqual(now);
  });

  it('markPaid rejects negative / non-integer amounts', () => {
    const p = fresh();
    p.markCheckoutPending('cs');
    expect(() =>
      p.markPaid({ paymentIntentId: 'pi', amountCents: -1, paidAt: new Date() }),
    ).toThrow(InvariantViolation);
    expect(() =>
      p.markPaid({ paymentIntentId: 'pi', amountCents: 12.5, paidAt: new Date() }),
    ).toThrow(InvariantViolation);
  });

  it('markPaid rejects from Refunded', () => {
    const p = fresh();
    p.markCheckoutPending('cs');
    p.markPaid({ paymentIntentId: 'pi', amountCents: 5000, paidAt: new Date() });
    p.markRefunded();
    expect(() =>
      p.markPaid({ paymentIntentId: 'pi2', amountCents: 5000, paidAt: new Date() }),
    ).toThrow(InvariantViolation);
  });

  it('markRefunded only valid from Paid', () => {
    const p = fresh();
    expect(() => p.markRefunded()).toThrow(InvariantViolation);
    p.markCheckoutPending('cs');
    expect(() => p.markRefunded()).toThrow(InvariantViolation);
    p.markPaid({ paymentIntentId: 'pi', amountCents: 1, paidAt: new Date() });
    p.markRefunded();
    expect(p.paymentStatus).toBe(RegistrationPaymentStatus.Refunded);
  });
});
