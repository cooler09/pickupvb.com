import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

/**
 * Orchestration tests for the `charge.refunded` + `payment_intent.payment_failed`
 * webhook handlers (architecture audit P3-2). DB writes moved behind
 * `EventPaymentRepository`; these pin the handler's branch selection, the
 * refund amount/title fallbacks, the best-effort notify, and that the team
 * mediators always run. Exact table ops live in the infrastructure adapter test.
 */

vi.mock('@/lib/handlers', () => ({
  repositories: {
    eventPaymentRepo: {
      deletePendingAttendeesByPaymentIntent: vi.fn(async () => {}),
      markPendingTipsFailedByPaymentIntent: vi.fn(async () => {}),
      markTipsRefundedByPaymentIntent: vi.fn(async () => {}),
      findRefundableAttendeeByPaymentIntent: vi.fn(async () => null),
      deleteAttendee: vi.fn(async () => {}),
      recordPaymentAudit: vi.fn(async () => {}),
      findEventTitle: vi.fn(async () => 'Beach Bash'),
    },
  },
}));

vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => {}) }));

vi.mock('./team-payment-mediators', () => ({
  refundTeamRegistrationIfAny: vi.fn(async () => {}),
  refundRosterTeamPaymentIfAny: vi.fn(async () => {}),
}));

// The refund handler evicts the event-detail cache after deleting the roster
// row (so the page reflects the refund). Inert mock — framework plumbing the
// e2e validates, kept from throwing outside a Next request scope.
vi.mock('next/cache', () => ({
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

import { handleChargeRefunded, handlePaymentFailed } from './charge';
import { repositories } from '@/lib/handlers';
import { notify } from '@/lib/notify';
import {
  refundTeamRegistrationIfAny,
  refundRosterTeamPaymentIfAny,
} from './team-payment-mediators';

const repo = repositories.eventPaymentRepo;
const findAtt = repo.findRefundableAttendeeByPaymentIntent as ReturnType<typeof vi.fn>;
const findTitle = repo.findEventTitle as ReturnType<typeof vi.fn>;
const notifyMock = notify as ReturnType<typeof vi.fn>;

function chargeOf(extra: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return {
    payment_intent: 'pi_1',
    amount_refunded: 1500,
    ...extra,
  } as unknown as Stripe.Charge;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handlePaymentFailed', () => {
  it('drops pending attendees and fails pending tips for the PI', async () => {
    await handlePaymentFailed({ id: 'pi_9' } as unknown as Stripe.PaymentIntent);
    expect(repo.deletePendingAttendeesByPaymentIntent).toHaveBeenCalledWith('pi_9');
    expect(repo.markPendingTipsFailedByPaymentIntent).toHaveBeenCalledWith('pi_9');
  });
});

describe('handleChargeRefunded', () => {
  it('no-ops entirely when the charge has no payment intent', async () => {
    await handleChargeRefunded(chargeOf({ payment_intent: null }));
    expect(repo.markTipsRefundedByPaymentIntent).not.toHaveBeenCalled();
    expect(refundTeamRegistrationIfAny).not.toHaveBeenCalled();
  });

  it('refunds tips and runs both team mediators even when no attendee matches', async () => {
    findAtt.mockResolvedValueOnce(null);
    await handleChargeRefunded(chargeOf());
    expect(repo.markTipsRefundedByPaymentIntent).toHaveBeenCalledWith('pi_1', expect.any(String));
    expect(refundTeamRegistrationIfAny).toHaveBeenCalledWith('pi_1', 1500);
    expect(refundRosterTeamPaymentIfAny).toHaveBeenCalledWith('pi_1', 1500);
    expect(repo.deleteAttendee).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('deletes the attendee, audits the refund, and notifies (amount_refunded wins)', async () => {
    findAtt.mockResolvedValueOnce({
      participantId: 'p1',
      userId: 'u1',
      amountPaidCents: 3000,
      eventId: 'e1',
    });
    await handleChargeRefunded(chargeOf({ amount_refunded: 1500 }));
    expect(repo.deleteAttendee).toHaveBeenCalledWith('p1');
    expect(repo.recordPaymentAudit).toHaveBeenCalledWith({
      eventId: 'e1',
      userId: 'u1',
      action: 'refunded',
      amountCents: 1500, // charge.amount_refunded preferred over amountPaidCents
      paymentIntentId: 'pi_1',
    });
    expect(notifyMock).toHaveBeenCalledWith(
      'payment.refunded',
      'u1',
      { eventId: 'e1', eventTitle: 'Beach Bash', amountCents: 1500 },
      { idempotencyKey: 'refund:pi_1' },
    );
  });

  it('falls back to the paid amount when amount_refunded is null', async () => {
    findAtt.mockResolvedValueOnce({
      participantId: 'p1',
      userId: 'u1',
      amountPaidCents: 3000,
      eventId: 'e1',
    });
    await handleChargeRefunded(chargeOf({ amount_refunded: null as unknown as number }));
    expect(repo.recordPaymentAudit).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 3000 }),
    );
  });

  it('defaults the event title to "event" when the event is gone', async () => {
    findAtt.mockResolvedValueOnce({
      participantId: 'p1',
      userId: 'u1',
      amountPaidCents: 3000,
      eventId: 'e1',
    });
    findTitle.mockResolvedValueOnce(null);
    await handleChargeRefunded(chargeOf());
    expect(notifyMock).toHaveBeenCalledWith(
      'payment.refunded',
      'u1',
      expect.objectContaining({ eventTitle: 'event' }),
      expect.anything(),
    );
  });

  it('swallows a notify failure (best-effort) without throwing', async () => {
    findAtt.mockResolvedValueOnce({
      participantId: 'p1',
      userId: 'u1',
      amountPaidCents: 3000,
      eventId: 'e1',
    });
    notifyMock.mockRejectedValueOnce(new Error('notify down'));
    await expect(handleChargeRefunded(chargeOf())).resolves.toBeUndefined();
    // the refund cleanup still ran
    expect(repo.deleteAttendee).toHaveBeenCalledWith('p1');
  });
});
