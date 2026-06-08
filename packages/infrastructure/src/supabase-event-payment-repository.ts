import type {
  EventPaymentRepository,
  PaidBadgeSlot,
  PaidSponsorSlot,
  PaymentAuditEntry,
  RefundableAttendee,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Adapter for {@link EventPaymentRepository} — the individual (non-team)
 * event-payment sidecars reconciled by the Stripe webhook. Runs on the
 * service-role admin client (session-less webhook context, AGENTS.md pitfall
 * #8). The query bodies are a verbatim relocation of the inline `admin.from(…)`
 * calls that previously lived in `apps/web/src/lib/webhooks/{checkout,charge}.ts`
 * (architecture audit P3-2) — see `supabase-event-payment-repository.test.ts`,
 * whose assertions were written from the original handler queries to pin parity.
 */
export class SupabaseEventPaymentRepository implements EventPaymentRepository {
  private _client: SupabaseClient | null = null;

  constructor(client?: SupabaseClient) {
    this._client = client ?? null;
  }

  private get client(): SupabaseClient {
    if (!this._client) this._client = createSupabaseAdminClient();
    return this._client;
  }

  // --- checkout.session.completed --------------------------------------------

  async markAttendeePaymentPaidByCheckoutSession(
    checkoutSessionId: string,
    paid: { paymentIntentId: string | null; amountCents: number; paidAt: string },
  ): Promise<void> {
    const { error } = await this.client
      .from('event_participant_payments')
      .update({
        payment_status: 'paid',
        payment_intent_id: paid.paymentIntentId,
        amount_paid_cents: paid.amountCents,
        paid_at: paid.paidAt,
      })
      .eq('checkout_session_id', checkoutSessionId);
    if (error) throw new Error(`mark attendee paid failed: ${error.message}`);
  }

  async recordPaymentAudit(entry: PaymentAuditEntry): Promise<void> {
    await this.client.from('event_payment_audit').insert({
      event_id: entry.eventId,
      user_id: entry.userId,
      action: entry.action,
      amount_cents: entry.amountCents,
      payment_intent_id: entry.paymentIntentId,
    });
  }

  async markTipPaid(
    tipId: string,
    paid: { paymentIntentId: string | null; paidAt: string },
  ): Promise<void> {
    const { error } = await this.client
      .from('event_tips')
      .update({
        status: 'paid',
        stripe_payment_intent_id: paid.paymentIntentId,
        paid_at: paid.paidAt,
      })
      .eq('id', tipId);
    if (error) throw new Error(`mark tip paid failed: ${error.message}`);
  }

  async upsertSponsorSlot(slot: PaidSponsorSlot): Promise<void> {
    const { error } = await this.client.from('event_sponsors').upsert(
      {
        event_id: slot.eventId,
        name: slot.name,
        blurb: slot.blurb,
        link_url: slot.linkUrl,
        logo_url: slot.logoUrl,
        discount_code: slot.discountCode,
        access_kind: 'ala_carte',
        purchased_by_user_id: slot.purchasedByUserId,
        stripe_checkout_session_id: slot.checkoutSessionId,
        stripe_payment_intent_id: slot.paymentIntentId,
        paid_at: slot.paidAt,
      },
      { onConflict: 'event_id' },
    );
    if (error) throw new Error(`mark sponsor slot paid failed: ${error.message}`);
  }

  async unlockBadgeSlot(slot: PaidBadgeSlot): Promise<void> {
    const { error } = await this.client.from('event_badge_access').upsert(
      {
        event_id: slot.eventId,
        access_kind: 'ala_carte',
        purchased_by_user_id: slot.purchasedByUserId,
        stripe_checkout_session_id: slot.checkoutSessionId,
        stripe_payment_intent_id: slot.paymentIntentId,
        paid_at: slot.paidAt,
      },
      { onConflict: 'event_id' },
    );
    if (error) throw new Error(`unlock badge slot failed: ${error.message}`);
  }

  async findEventHostId(eventId: string): Promise<string | null> {
    const { data } = await this.client
      .from('events')
      .select('host_id')
      .eq('id', eventId)
      .maybeSingle();
    return (data as { host_id: string } | null)?.host_id ?? null;
  }

  // --- checkout.session.expired ----------------------------------------------

  async deletePendingAttendeeByCheckoutSession(checkoutSessionId: string): Promise<void> {
    const { data: payRow } = await this.client
      .from('event_participant_payments')
      .select('participant_id')
      .eq('checkout_session_id', checkoutSessionId)
      .eq('payment_status', 'pending')
      .maybeSingle();
    const pid = (payRow as { participant_id: string } | null)?.participant_id;
    if (pid) {
      await this.client.from('event_participants').delete().eq('id', pid);
    }
  }

  async deletePendingTip(tipId: string): Promise<void> {
    await this.client.from('event_tips').delete().eq('id', tipId).eq('status', 'pending');
  }

  // `payment_intent.payment_failed` is a no-op (see `handlePaymentFailed`), so
  // there is no adapter method for it — pending cleanup is owned by the
  // checkout.session.expired methods above + the cancel route.

  // --- charge.refunded -------------------------------------------------------

  async markTipsRefundedByPaymentIntent(
    paymentIntentId: string,
    refundedAt: string,
  ): Promise<void> {
    await this.client
      .from('event_tips')
      .update({
        status: 'refunded',
        refunded_at: refundedAt,
      })
      .eq('stripe_payment_intent_id', paymentIntentId);
  }

  async findRefundableAttendeeByPaymentIntent(
    paymentIntentId: string,
  ): Promise<RefundableAttendee | null> {
    const { data: attendeeRow } = await this.client
      .from('event_participants')
      .select(
        'id, user_id, payment:event_participant_payments!inner(amount_paid_cents, payment_intent_id), division:event_divisions!inner(event_id)',
      )
      .eq('role', 'attendee')
      .eq('payment.payment_intent_id', paymentIntentId)
      .maybeSingle();
    type AttRow = {
      id: string;
      user_id: string;
      payment: { amount_paid_cents: number } | null;
      division: { event_id: string } | null;
    };
    const att = attendeeRow as unknown as AttRow | null;
    if (att && att.division) {
      return {
        participantId: att.id,
        userId: att.user_id,
        amountPaidCents: att.payment?.amount_paid_cents ?? 0,
        eventId: att.division.event_id,
      };
    }
    return null;
  }

  async deleteAttendee(participantId: string): Promise<void> {
    await this.client.from('event_participants').delete().eq('id', participantId);
  }

  async findEventTitle(eventId: string): Promise<string | null> {
    const { data: evRow } = await this.client
      .from('events')
      .select('title')
      .eq('id', eventId)
      .maybeSingle();
    return (evRow as { title: string } | null)?.title ?? null;
  }

  // --- charge.dispute.created ------------------------------------------------

  async findTipContextByPaymentIntent(
    paymentIntentId: string,
  ): Promise<{ eventId: string; hostId: string } | null> {
    const { data } = await this.client
      .from('event_tips')
      .select('event_id, host_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    const row = data as { event_id: string; host_id: string } | null;
    return row ? { eventId: row.event_id, hostId: row.host_id } : null;
  }
}
