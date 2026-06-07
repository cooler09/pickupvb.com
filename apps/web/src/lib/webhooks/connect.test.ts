import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

/**
 * `maybeNotifyStripeActionRequired` lights up the `host.stripe.action_required`
 * kind, which had a template but no trigger. These pin the behaviour that would
 * silently regress on a busy webhook: it only fires when a requirement is
 * outstanding, resolves the host from the connected account, dedups in_app via
 * the unread-bell coalesce, and stamps an email idempotency key keyed on the
 * requirement *signature* (so resends with the same state don't re-mail). The
 * admin client + `notify` fan-out are mocked at the module boundary.
 */
const h = vi.hoisted(() => ({
  adminFactory: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({ getAdminSupabase: h.adminFactory }));
vi.mock('@/lib/notify', () => ({ notify: h.notify }));
vi.mock('@/lib/host-stripe-account', () => ({ mirrorStripeAccountUpdate: vi.fn(async () => {}) }));
vi.mock('@/lib/handlers', () => ({ analytics: { capture: vi.fn() } }));

import { maybeNotifyStripeActionRequired } from './connect';

type Canned = {
  host: { user_id: string } | null;
  pending: { id: string }[];
};

function fakeAdmin(canned: Canned) {
  function builder(data: unknown) {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ['select', 'eq', 'is', 'limit']) b[m] = chain;
    b['maybeSingle'] = () => Promise.resolve({ data, error: null });
    b['then'] = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(onF, onR);
    return b;
  }
  return {
    from: (table: string) => {
      if (table === 'host_stripe_accounts') return builder(canned.host);
      if (table === 'notifications') return builder(canned.pending);
      return builder(null);
    },
  };
}

function account(requirements: Partial<Stripe.Account.Requirements> | null): Stripe.Account {
  return { id: 'acct_123', requirements } as unknown as Stripe.Account;
}

beforeEach(() => {
  h.notify.mockReset();
  h.notify.mockResolvedValue(undefined);
  h.adminFactory.mockReset();
  h.adminFactory.mockReturnValue(fakeAdmin({ host: { user_id: 'host1' }, pending: [] }));
});

describe('maybeNotifyStripeActionRequired', () => {
  it('does nothing (no admin client) when there is no outstanding requirement', async () => {
    await maybeNotifyStripeActionRequired(account({ past_due: [], currently_due: [] }));
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.adminFactory).not.toHaveBeenCalled();
  });

  it('pings the host with a soft message + signature key for currently_due items', async () => {
    await maybeNotifyStripeActionRequired(account({ currently_due: ['individual.dob'] }));
    expect(h.notify).toHaveBeenCalledTimes(1);
    const [kind, userId, payload, opts] = h.notify.mock.calls[0]!;
    expect(kind).toBe('host.stripe.action_required');
    expect(userId).toBe('host1');
    expect((payload as { message: string }).message).toContain('more information');
    expect(opts?.idempotencyKey).toBe('stripe-req:acct_123:|individual.dob');
  });

  it('uses the paused-payouts message when past_due or disabled', async () => {
    await maybeNotifyStripeActionRequired(account({ past_due: ['individual.id_number'] }));
    const [, , payload] = h.notify.mock.calls[0]!;
    expect((payload as { message: string }).message).toContain('paused');
  });

  it('coalesces: skips when an unread action-required bell is already waiting', async () => {
    h.adminFactory.mockReturnValue(
      fakeAdmin({ host: { user_id: 'host1' }, pending: [{ id: 'x' }] }),
    );
    await maybeNotifyStripeActionRequired(account({ currently_due: ['individual.dob'] }));
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('does nothing when the account maps to no host row', async () => {
    h.adminFactory.mockReturnValue(fakeAdmin({ host: null, pending: [] }));
    await maybeNotifyStripeActionRequired(account({ currently_due: ['individual.dob'] }));
    expect(h.notify).not.toHaveBeenCalled();
  });
});
