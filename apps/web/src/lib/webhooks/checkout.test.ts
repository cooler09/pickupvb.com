import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

/**
 * Orchestration tests for the `checkout.session.*` webhook handlers
 * (architecture audit P3-2). After the DB writes moved behind
 * `EventPaymentRepository`, the handler's own job is branch selection + arg
 * mapping + analytics/notify dispatch + the metadata guards. The repo is faked
 * here; the exact table ops it issues are pinned separately in
 * `packages/infrastructure/.../supabase-event-payment-repository.test.ts`.
 */

vi.mock('@/lib/handlers', () => ({
  analytics: { capture: vi.fn() },
  repositories: {
    eventPaymentRepo: {
      markAttendeePaymentPaidByCheckoutSession: vi.fn(async () => {}),
      recordPaymentAudit: vi.fn(async () => {}),
      markTipPaid: vi.fn(async () => {}),
      upsertSponsorSlot: vi.fn(async () => {}),
      unlockBadgeSlot: vi.fn(async () => {}),
      findEventHostId: vi.fn(async () => 'host_from_db'),
      deletePendingAttendeeByCheckoutSession: vi.fn(async () => {}),
      deletePendingTip: vi.fn(async () => {}),
    },
  },
}));

vi.mock('./team-payment-mediators', () => ({
  markTeamRegistrationPaid: vi.fn(async () => {}),
  markRosterTeamPaymentPaid: vi.fn(async () => {}),
  expireTeamRegistrationCheckout: vi.fn(async () => {}),
  expireRosterTeamPaymentCheckout: vi.fn(async () => {}),
}));

vi.mock('@/lib/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(async () => {}), info: vi.fn() },
}));

import { handleCheckoutCompleted, handleCheckoutExpired } from './checkout';
import { analytics, repositories } from '@/lib/handlers';
import {
  markTeamRegistrationPaid,
  markRosterTeamPaymentPaid,
  expireTeamRegistrationCheckout,
  expireRosterTeamPaymentCheckout,
} from './team-payment-mediators';
import { log } from '@/lib/log';

const repo = repositories.eventPaymentRepo;
const capture = analytics.capture as ReturnType<typeof vi.fn>;

function sessionOf(
  metadata: Record<string, string>,
  extra: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: 'cs_1',
    metadata,
    payment_intent: 'pi_1',
    amount_total: 2500,
    customer: null,
    ...extra,
  } as unknown as Stripe.Checkout.Session;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleCheckoutCompleted — guards', () => {
  it('no-ops when event_id is missing', async () => {
    await handleCheckoutCompleted(sessionOf({ kind: 'attendee', user_id: 'u1' }));
    expect(repo.markAttendeePaymentPaidByCheckoutSession).not.toHaveBeenCalled();
  });

  it('no-ops when kind is missing', async () => {
    await handleCheckoutCompleted(sessionOf({ event_id: 'e1', user_id: 'u1' }));
    expect(repo.markAttendeePaymentPaidByCheckoutSession).not.toHaveBeenCalled();
  });

  it('throws on a session/customer user_id mismatch (before any write)', async () => {
    const session = sessionOf(
      { event_id: 'e1', kind: 'attendee', user_id: 'u1' },
      {
        customer: {
          id: 'cus_1',
          deleted: false,
          metadata: { user_id: 'someone_else' },
        } as unknown as Stripe.Customer,
      },
    );
    await expect(handleCheckoutCompleted(session)).rejects.toThrow('metadata user_id mismatch');
    expect(repo.markAttendeePaymentPaidByCheckoutSession).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalled();
  });

  it('proceeds when the customer user_id matches', async () => {
    const session = sessionOf(
      { event_id: 'e1', kind: 'attendee', user_id: 'u1', host_id: 'h1' },
      {
        customer: {
          id: 'cus_1',
          deleted: false,
          metadata: { user_id: 'u1' },
        } as unknown as Stripe.Customer,
      },
    );
    await handleCheckoutCompleted(session);
    expect(repo.markAttendeePaymentPaidByCheckoutSession).toHaveBeenCalledTimes(1);
  });
});

describe('handleCheckoutCompleted — attendee', () => {
  it('marks the payment paid, audits it, and captures a ticket sale', async () => {
    await handleCheckoutCompleted(
      sessionOf({ event_id: 'e1', kind: 'attendee', user_id: 'u1', host_id: 'h1' }),
    );
    expect(repo.markAttendeePaymentPaidByCheckoutSession).toHaveBeenCalledWith('cs_1', {
      paymentIntentId: 'pi_1',
      amountCents: 2500,
      paidAt: expect.any(String),
    });
    expect(repo.recordPaymentAudit).toHaveBeenCalledWith({
      eventId: 'e1',
      userId: 'u1',
      action: 'paid',
      amountCents: 2500,
      paymentIntentId: 'pi_1',
    });
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'checkout_completed',
        props: expect.objectContaining({ kind: 'ticket', hostId: 'h1', amountCents: 2500 }),
      }),
      'u1',
    );
    // host was in metadata → no DB lookup
    expect(repo.findEventHostId).not.toHaveBeenCalled();
  });

  it('falls back to a host lookup when host_id is absent from metadata', async () => {
    await handleCheckoutCompleted(sessionOf({ event_id: 'e1', kind: 'attendee', user_id: 'u1' }));
    expect(repo.findEventHostId).toHaveBeenCalledWith('e1');
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ props: expect.objectContaining({ hostId: 'host_from_db' }) }),
      'u1',
    );
  });
});

describe('handleCheckoutCompleted — tip', () => {
  it('marks the tip paid and captures a tip sale', async () => {
    await handleCheckoutCompleted(
      sessionOf({ event_id: 'e1', kind: 'tip', tip_id: 't1', user_id: 'u1', host_id: 'h1' }),
    );
    expect(repo.markTipPaid).toHaveBeenCalledWith('t1', {
      paymentIntentId: 'pi_1',
      paidAt: expect.any(String),
    });
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ props: expect.objectContaining({ kind: 'tip' }) }),
      'u1',
    );
  });
});

describe('handleCheckoutCompleted — team branches (mediators)', () => {
  it('delegates a paid team registration to the aggregate mediator', async () => {
    await handleCheckoutCompleted(
      sessionOf({
        event_id: 'e1',
        kind: 'team_registration',
        registration_id: 'r1',
        host_id: 'h1',
        captain_id: 'c1',
      }),
    );
    expect(markTeamRegistrationPaid).toHaveBeenCalledWith({
      registrationId: 'r1',
      paymentIntentId: 'pi_1',
      amountCents: 2500,
      paidAt: expect.any(Date),
    });
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ props: expect.objectContaining({ kind: 'team' }) }),
      'c1',
    );
  });

  it('skips the team-registration mediator when the PI is missing', async () => {
    await handleCheckoutCompleted(
      sessionOf(
        { event_id: 'e1', kind: 'team_registration', registration_id: 'r1' },
        { payment_intent: null },
      ),
    );
    expect(markTeamRegistrationPaid).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  it('delegates a roster team payment to its mediator', async () => {
    await handleCheckoutCompleted(
      sessionOf({
        event_id: 'e1',
        kind: 'roster_team_payment',
        payment_id: 'p1',
        captain_id: 'c1',
      }),
    );
    expect(markRosterTeamPaymentPaid).toHaveBeenCalledWith({
      paymentId: 'p1',
      paymentIntentId: 'pi_1',
      amountCents: 2500,
      paidAt: expect.any(Date),
    });
  });
});

describe('handleCheckoutCompleted — sponsor slot', () => {
  it('upserts the sponsor slot and captures a sponsor sale', async () => {
    await handleCheckoutCompleted(
      sessionOf({
        event_id: 'e1',
        kind: 'sponsor_slot',
        user_id: 'u1',
        host_id: 'h1',
        sponsor_name: '  Acme  ',
        sponsor_blurb: ' hi ',
        sponsor_link_url: ' https://acme.test ',
      }),
    );
    expect(repo.upsertSponsorSlot).toHaveBeenCalledWith({
      eventId: 'e1',
      name: 'Acme',
      blurb: 'hi',
      linkUrl: 'https://acme.test',
      logoUrl: null,
      discountCode: null,
      purchasedByUserId: 'u1',
      checkoutSessionId: 'cs_1',
      paymentIntentId: 'pi_1',
      paidAt: expect.any(String),
    });
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ props: expect.objectContaining({ kind: 'sponsor_slot' }) }),
      'u1',
    );
  });

  it('no-ops when the sponsor name is blank', async () => {
    await handleCheckoutCompleted(
      sessionOf({ event_id: 'e1', kind: 'sponsor_slot', user_id: 'u1', sponsor_name: '   ' }),
    );
    expect(repo.upsertSponsorSlot).not.toHaveBeenCalled();
  });
});

describe('handleCheckoutCompleted — badge slot', () => {
  it('unlocks the à-la-carte badge slot and captures the sale', async () => {
    await handleCheckoutCompleted(
      sessionOf({ event_id: 'e1', kind: 'badge_slot', user_id: 'u1', host_id: 'h1' }),
    );
    expect(repo.unlockBadgeSlot).toHaveBeenCalledWith({
      eventId: 'e1',
      purchasedByUserId: 'u1',
      checkoutSessionId: 'cs_1',
      paymentIntentId: 'pi_1',
      paidAt: expect.any(String),
    });
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ props: expect.objectContaining({ kind: 'badge_slot' }) }),
      'u1',
    );
  });

  it('no-ops when the buyer user_id is missing', async () => {
    await handleCheckoutCompleted(sessionOf({ event_id: 'e1', kind: 'badge_slot' }));
    expect(repo.unlockBadgeSlot).not.toHaveBeenCalled();
  });
});

describe('handleCheckoutExpired', () => {
  it('drops a pending attendee reservation', async () => {
    await handleCheckoutExpired(sessionOf({ event_id: 'e1', kind: 'attendee', user_id: 'u1' }));
    expect(repo.deletePendingAttendeeByCheckoutSession).toHaveBeenCalledWith('cs_1');
  });

  it('drops a pending tip', async () => {
    await handleCheckoutExpired(sessionOf({ event_id: 'e1', kind: 'tip', tip_id: 't1' }));
    expect(repo.deletePendingTip).toHaveBeenCalledWith('t1');
  });

  it('expires a team registration via its mediator', async () => {
    await handleCheckoutExpired(
      sessionOf({ event_id: 'e1', kind: 'team_registration', registration_id: 'r1' }),
    );
    expect(expireTeamRegistrationCheckout).toHaveBeenCalledWith('r1');
  });

  it('expires a roster team payment via its mediator', async () => {
    await handleCheckoutExpired(
      sessionOf({ event_id: 'e1', kind: 'roster_team_payment', payment_id: 'p1' }),
    );
    expect(expireRosterTeamPaymentCheckout).toHaveBeenCalledWith('p1');
  });

  it('no-ops when metadata is incomplete', async () => {
    await handleCheckoutExpired(sessionOf({ kind: 'attendee' }));
    expect(repo.deletePendingAttendeeByCheckoutSession).not.toHaveBeenCalled();
  });
});
