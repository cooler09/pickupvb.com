import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The team mediators must write an `event_payment_audit` row on every
 * paid/refunded transition so team entry fees show on the captain's receipts
 * and the host's earnings (receipts-tax R-1). The aggregates + their repos are
 * faked; this pins the ledger write (category `'team'`, the captain as the
 * payer, refund amount preference) and the run-once idempotency guard.
 */

vi.mock('@/lib/handlers', () => ({
  repositories: {
    eventPaymentRepo: { recordPaymentAudit: vi.fn(async () => {}) },
    eventTeamRegistrationRepo: {
      findById: vi.fn(),
      findByPaymentIntentId: vi.fn(),
      save: vi.fn(async () => {}),
    },
    eventTeamPaymentRepo: {
      findById: vi.fn(),
      findByPaymentIntentId: vi.fn(),
      save: vi.fn(async () => {}),
    },
  },
}));

vi.mock('@/lib/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(async () => {}), info: vi.fn() },
}));

import {
  markTeamRegistrationPaid,
  refundTeamRegistrationIfAny,
  markRosterTeamPaymentPaid,
  refundRosterTeamPaymentIfAny,
} from './team-payment-mediators';
import { repositories } from '@/lib/handlers';

const recordPaymentAudit = repositories.eventPaymentRepo.recordPaymentAudit as ReturnType<
  typeof vi.fn
>;
const registrationRepo = repositories.eventTeamRegistrationRepo as unknown as {
  findById: ReturnType<typeof vi.fn>;
  findByPaymentIntentId: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
};
const paymentRepo = repositories.eventTeamPaymentRepo as unknown as {
  findById: ReturnType<typeof vi.fn>;
  findByPaymentIntentId: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
};

function fakeReg(over: Record<string, unknown> = {}) {
  return {
    paymentStatus: 'pending',
    eventId: 'e1',
    captainId: 'c1',
    amountPaidCents: 2500,
    markPaid: vi.fn(),
    markRefunded: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('markTeamRegistrationPaid', () => {
  it('records a paid team ledger row keyed to the captain', async () => {
    registrationRepo.findById.mockResolvedValueOnce(fakeReg());
    await markTeamRegistrationPaid({
      registrationId: 'r1',
      paymentIntentId: 'pi_1',
      amountCents: 2500,
      paidAt: new Date(),
    });
    expect(recordPaymentAudit).toHaveBeenCalledWith({
      eventId: 'e1',
      userId: 'c1',
      action: 'paid',
      amountCents: 2500,
      paymentIntentId: 'pi_1',
      category: 'team',
    });
  });

  it('records userId null for an account-less captain', async () => {
    registrationRepo.findById.mockResolvedValueOnce(fakeReg({ captainId: null }));
    await markTeamRegistrationPaid({
      registrationId: 'r1',
      paymentIntentId: 'pi_1',
      amountCents: 2500,
      paidAt: new Date(),
    });
    expect(recordPaymentAudit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, category: 'team' }),
    );
  });

  it('is idempotent — already-paid registration writes no ledger row', async () => {
    registrationRepo.findById.mockResolvedValueOnce(fakeReg({ paymentStatus: 'paid' }));
    await markTeamRegistrationPaid({
      registrationId: 'r1',
      paymentIntentId: 'pi_1',
      amountCents: 2500,
      paidAt: new Date(),
    });
    expect(recordPaymentAudit).not.toHaveBeenCalled();
  });
});

describe('refundTeamRegistrationIfAny', () => {
  it('records a refunded row, preferring the Stripe refund amount', async () => {
    registrationRepo.findByPaymentIntentId.mockResolvedValueOnce(
      fakeReg({ paymentStatus: 'paid' }),
    );
    await refundTeamRegistrationIfAny('pi_1', 1500);
    expect(recordPaymentAudit).toHaveBeenCalledWith({
      eventId: 'e1',
      userId: 'c1',
      action: 'refunded',
      amountCents: 1500,
      paymentIntentId: 'pi_1',
      category: 'team',
    });
  });

  it('falls back to the paid amount when the refund amount is null', async () => {
    registrationRepo.findByPaymentIntentId.mockResolvedValueOnce(
      fakeReg({ paymentStatus: 'paid', amountPaidCents: 2500 }),
    );
    await refundTeamRegistrationIfAny('pi_1', null);
    expect(recordPaymentAudit).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 2500 }));
  });

  it('no-ops when the registration was not paid', async () => {
    registrationRepo.findByPaymentIntentId.mockResolvedValueOnce(
      fakeReg({ paymentStatus: 'pending' }),
    );
    await refundTeamRegistrationIfAny('pi_1', 1500);
    expect(recordPaymentAudit).not.toHaveBeenCalled();
  });
});

describe('roster team payment mediators', () => {
  it('records a paid team ledger row', async () => {
    paymentRepo.findById.mockResolvedValueOnce(fakeReg());
    await markRosterTeamPaymentPaid({
      paymentId: 'p1',
      paymentIntentId: 'pi_2',
      amountCents: 3000,
      paidAt: new Date(),
    });
    expect(recordPaymentAudit).toHaveBeenCalledWith({
      eventId: 'e1',
      userId: 'c1',
      action: 'paid',
      amountCents: 3000,
      paymentIntentId: 'pi_2',
      category: 'team',
    });
  });

  it('records a refunded team ledger row', async () => {
    paymentRepo.findByPaymentIntentId.mockResolvedValueOnce(fakeReg({ paymentStatus: 'paid' }));
    await refundRosterTeamPaymentIfAny('pi_2', 3000);
    expect(recordPaymentAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'refunded', amountCents: 3000, category: 'team' }),
    );
  });
});
