import { describe, it, expect } from 'vitest';
import { SupabaseEventPaymentRepository } from './supabase-event-payment-repository.js';

/**
 * Characterization tests for the Stripe-webhook payment sidecar adapter
 * (architecture audit P3-2). The query bodies were relocated verbatim from the
 * inline `admin.from(…)` calls in `apps/web/src/lib/webhooks/{checkout,charge}.ts`;
 * these assertions are written from the *original* handler queries, so the
 * adapter has to reproduce the exact table / op / filter / payload — pinning the
 * live charge-reconciliation write path against a silent regression.
 *
 * Uses a hand-rolled chainable Supabase mock (the repo's adapter tests don't
 * use a shared client double) injected through the adapter constructor.
 */

type Rec = {
  table: string;
  op: string;
  payload?: unknown;
  opts?: unknown;
  filters: unknown[][];
  select?: string;
};

function makeClient() {
  const ops: Rec[] = [];
  const data: Record<string, unknown> = {};
  const errors: Record<string, { message: string } | null> = {};

  const from = (table: string) => {
    const rec: Rec = { table, op: '', filters: [] };
    let recorded = false;
    const record = () => {
      if (!recorded) {
        recorded = true;
        ops.push(rec);
      }
    };
    const result = () => ({ data: data[table] ?? null, error: errors[table] ?? null });
    const chain: any = {
      select(cols: string) {
        rec.select = cols;
        if (!rec.op) rec.op = 'select';
        return chain;
      },
      update(p: unknown) {
        rec.op = 'update';
        rec.payload = p;
        return chain;
      },
      insert(p: unknown) {
        rec.op = 'insert';
        rec.payload = p;
        record();
        return Promise.resolve(result());
      },
      upsert(p: unknown, o: unknown) {
        rec.op = 'upsert';
        rec.payload = p;
        rec.opts = o;
        return chain;
      },
      delete() {
        rec.op = 'delete';
        return chain;
      },
      eq(c: string, v: unknown) {
        rec.filters.push(['eq', c, v]);
        return chain;
      },
      in(c: string, v: unknown) {
        rec.filters.push(['in', c, v]);
        return chain;
      },
      is(c: string, v: unknown) {
        rec.filters.push(['is', c, v]);
        return chain;
      },
      not(c: string, op: string, v: unknown) {
        rec.filters.push(['not', c, op, v]);
        return chain;
      },
      maybeSingle() {
        record();
        return Promise.resolve(result());
      },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        record();
        return Promise.resolve(result()).then(res, rej);
      },
    };
    return chain;
  };

  return { client: { from } as never, ops, data, errors };
}

function repo(mock: ReturnType<typeof makeClient>) {
  return new SupabaseEventPaymentRepository(mock.client);
}

describe('SupabaseEventPaymentRepository — checkout.session.completed', () => {
  it('markAttendeePaymentPaidByCheckoutSession updates the payment row by session id', async () => {
    const mock = makeClient();
    await repo(mock).markAttendeePaymentPaidByCheckoutSession('cs_1', {
      paymentIntentId: 'pi_1',
      amountCents: 2500,
      paidAt: '2026-06-01T00:00:00.000Z',
    });
    expect(mock.ops).toEqual([
      {
        table: 'event_participant_payments',
        op: 'update',
        payload: {
          payment_status: 'paid',
          payment_intent_id: 'pi_1',
          amount_paid_cents: 2500,
          paid_at: '2026-06-01T00:00:00.000Z',
        },
        filters: [['eq', 'checkout_session_id', 'cs_1']],
      },
    ]);
  });

  it('markAttendeePaymentPaidByCheckoutSession throws on a DB error (so Stripe retries)', async () => {
    const mock = makeClient();
    mock.errors['event_participant_payments'] = { message: 'boom' };
    await expect(
      repo(mock).markAttendeePaymentPaidByCheckoutSession('cs_1', {
        paymentIntentId: 'pi_1',
        amountCents: 2500,
        paidAt: 'now',
      }),
    ).rejects.toThrow('mark attendee paid failed: boom');
  });

  it('recordPaymentAudit inserts an audit row and does not throw on error', async () => {
    const mock = makeClient();
    mock.errors['event_payment_audit'] = { message: 'ignored' };
    await repo(mock).recordPaymentAudit({
      eventId: 'e1',
      userId: 'u1',
      action: 'paid',
      amountCents: 2500,
      paymentIntentId: 'pi_1',
      category: 'ticket',
    });
    expect(mock.ops).toEqual([
      {
        table: 'event_payment_audit',
        op: 'insert',
        payload: {
          event_id: 'e1',
          user_id: 'u1',
          action: 'paid',
          amount_cents: 2500,
          payment_intent_id: 'pi_1',
          category: 'ticket',
        },
        filters: [],
      },
    ]);
  });

  it('markTipPaid updates the tip row by id and throws on error', async () => {
    const mock = makeClient();
    await repo(mock).markTipPaid('tip_1', { paymentIntentId: 'pi_1', paidAt: 'now' });
    expect(mock.ops[0]).toMatchObject({
      table: 'event_tips',
      op: 'update',
      payload: { status: 'paid', stripe_payment_intent_id: 'pi_1', paid_at: 'now' },
      filters: [['eq', 'id', 'tip_1']],
    });

    const errMock = makeClient();
    errMock.errors['event_tips'] = { message: 'nope' };
    await expect(
      repo(errMock).markTipPaid('tip_1', { paymentIntentId: 'pi_1', paidAt: 'now' }),
    ).rejects.toThrow('mark tip paid failed: nope');
  });

  it('upsertSponsorSlot upserts ONLY the sponsor content on event_id (entitlement decoupled — SP-1)', async () => {
    const mock = makeClient();
    await repo(mock).upsertSponsorSlot({
      eventId: 'e1',
      name: 'Acme',
      blurb: 'b',
      linkUrl: 'https://acme.test',
      logoUrl: null,
      discountCode: 'ACME10',
    });
    expect(mock.ops[0]).toMatchObject({
      table: 'event_sponsors',
      op: 'upsert',
      payload: {
        event_id: 'e1',
        name: 'Acme',
        blurb: 'b',
        link_url: 'https://acme.test',
        logo_url: null,
        discount_code: 'ACME10',
      },
      opts: { onConflict: 'event_id' },
    });
    // The content write must NOT carry entitlement columns — those moved to
    // `event_sponsor_access`. This guards against re-coupling (the bug that let
    // `removeSponsor` destroy a paid unlock).
    expect(mock.ops[0]?.payload).not.toHaveProperty('access_kind');
    expect(mock.ops[0]?.payload).not.toHaveProperty('paid_at');
  });

  it('unlockSponsorSlot records the entitlement in event_sponsor_access on event_id', async () => {
    const mock = makeClient();
    await repo(mock).unlockSponsorSlot({
      eventId: 'e1',
      purchasedByUserId: 'u1',
      checkoutSessionId: 'cs_1',
      paymentIntentId: 'pi_1',
      paidAt: 'now',
    });
    expect(mock.ops[0]).toMatchObject({
      table: 'event_sponsor_access',
      op: 'upsert',
      payload: {
        event_id: 'e1',
        access_kind: 'ala_carte',
        purchased_by_user_id: 'u1',
        stripe_checkout_session_id: 'cs_1',
        stripe_payment_intent_id: 'pi_1',
        paid_at: 'now',
      },
      opts: { onConflict: 'event_id' },
    });
  });

  it('findEventHostId selects host_id and null-coalesces a missing row', async () => {
    const found = makeClient();
    found.data['events'] = { host_id: 'host_9' };
    expect(await repo(found).findEventHostId('e1')).toBe('host_9');
    expect(found.ops[0]).toMatchObject({
      table: 'events',
      op: 'select',
      select: 'host_id',
      filters: [['eq', 'id', 'e1']],
    });

    const missing = makeClient();
    expect(await repo(missing).findEventHostId('e1')).toBeNull();
  });
});

describe('SupabaseEventPaymentRepository — checkout.session.expired', () => {
  it('deletePendingAttendeeByCheckoutSession looks up the pending payment then deletes the participant', async () => {
    const mock = makeClient();
    mock.data['event_participant_payments'] = { participant_id: 'p_1' };
    await repo(mock).deletePendingAttendeeByCheckoutSession('cs_1');
    expect(mock.ops).toEqual([
      {
        table: 'event_participant_payments',
        op: 'select',
        select: 'participant_id',
        filters: [
          ['eq', 'checkout_session_id', 'cs_1'],
          ['eq', 'payment_status', 'pending'],
        ],
      },
      {
        table: 'event_participants',
        op: 'delete',
        filters: [['eq', 'id', 'p_1']],
      },
    ]);
  });

  it('deletePendingAttendeeByCheckoutSession skips the delete when no pending payment matches', async () => {
    const mock = makeClient();
    await repo(mock).deletePendingAttendeeByCheckoutSession('cs_1');
    expect(mock.ops).toHaveLength(1);
    expect(mock.ops[0]?.table).toBe('event_participant_payments');
  });

  it('deletePendingTip deletes the tip only while still pending', async () => {
    const mock = makeClient();
    await repo(mock).deletePendingTip('tip_1');
    expect(mock.ops).toEqual([
      {
        table: 'event_tips',
        op: 'delete',
        filters: [
          ['eq', 'id', 'tip_1'],
          ['eq', 'status', 'pending'],
        ],
      },
    ]);
  });
});

describe('SupabaseEventPaymentRepository — charge.refunded', () => {
  it('markTipsRefundedByPaymentIntent flips a paid tip to refunded and returns its audit context', async () => {
    const mock = makeClient();
    mock.data['event_tips'] = {
      event_id: 'e_1',
      tipper_user_id: 'u_1',
      amount_cents: 500,
    };
    const ctx = await repo(mock).markTipsRefundedByPaymentIntent(
      'pi_1',
      '2026-06-02T00:00:00.000Z',
    );
    expect(ctx).toEqual({ eventId: 'e_1', userId: 'u_1', amountCents: 500 });
    expect(mock.ops).toEqual([
      {
        table: 'event_tips',
        op: 'update',
        payload: { status: 'refunded', refunded_at: '2026-06-02T00:00:00.000Z' },
        select: 'event_id, tipper_user_id, amount_cents',
        filters: [
          ['eq', 'stripe_payment_intent_id', 'pi_1'],
          ['eq', 'status', 'paid'],
        ],
      },
    ]);
  });

  it('markTipsRefundedByPaymentIntent returns null when no paid tip matches (idempotent retry)', async () => {
    const mock = makeClient();
    expect(
      await repo(mock).markTipsRefundedByPaymentIntent('pi_1', '2026-06-02T00:00:00.000Z'),
    ).toBeNull();
  });

  it('findRefundableAttendeeByPaymentIntent maps the joined attendee row', async () => {
    const mock = makeClient();
    mock.data['event_participants'] = {
      id: 'p_1',
      user_id: 'u_1',
      payment: { amount_paid_cents: 3000, payment_intent_id: 'pi_1' },
      division: { event_id: 'e_1' },
    };
    const att = await repo(mock).findRefundableAttendeeByPaymentIntent('pi_1');
    expect(att).toEqual({
      participantId: 'p_1',
      userId: 'u_1',
      amountPaidCents: 3000,
      eventId: 'e_1',
    });
    expect(mock.ops[0]).toMatchObject({
      table: 'event_participants',
      op: 'select',
      filters: [
        ['eq', 'role', 'attendee'],
        ['eq', 'payment.payment_intent_id', 'pi_1'],
      ],
    });
    expect(mock.ops[0]?.select).toContain('event_participant_payments!inner');
    expect(mock.ops[0]?.select).toContain('event_divisions!inner');
  });

  it('findRefundableAttendeeByPaymentIntent returns null when no row or no division', async () => {
    const none = makeClient();
    expect(await repo(none).findRefundableAttendeeByPaymentIntent('pi_1')).toBeNull();

    const noDivision = makeClient();
    noDivision.data['event_participants'] = {
      id: 'p_1',
      user_id: 'u_1',
      payment: { amount_paid_cents: 3000 },
      division: null,
    };
    expect(await repo(noDivision).findRefundableAttendeeByPaymentIntent('pi_1')).toBeNull();
  });

  it('findRefundableAttendeeByPaymentIntent defaults a missing amount to 0', async () => {
    const mock = makeClient();
    mock.data['event_participants'] = {
      id: 'p_1',
      user_id: 'u_1',
      payment: null,
      division: { event_id: 'e_1' },
    };
    const att = await repo(mock).findRefundableAttendeeByPaymentIntent('pi_1');
    expect(att?.amountPaidCents).toBe(0);
  });

  it('deleteAttendee deletes the participant by id', async () => {
    const mock = makeClient();
    await repo(mock).deleteAttendee('p_1');
    expect(mock.ops).toEqual([
      { table: 'event_participants', op: 'delete', filters: [['eq', 'id', 'p_1']] },
    ]);
  });

  it('findEventTitle returns the title or null when the event is gone', async () => {
    const found = makeClient();
    found.data['events'] = { title: 'Beach Bash' };
    expect(await repo(found).findEventTitle('e_1')).toBe('Beach Bash');
    expect(found.ops[0]).toMatchObject({
      table: 'events',
      op: 'select',
      select: 'title',
      filters: [['eq', 'id', 'e_1']],
    });

    const missing = makeClient();
    expect(await repo(missing).findEventTitle('e_1')).toBeNull();
  });
});
