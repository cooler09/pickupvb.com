'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import type Stripe from 'stripe';
import { isStripeConfigured } from '@/lib/stripe';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { requireRealUser } from '@/lib/server-auth';
import { getHostPass } from '@/lib/passes';
import { platformFeeCentsFor } from '@/lib/event-pricing';
import { getHostStripeAccount } from '@/lib/host-stripe-account';
import { createDestinationCheckoutSession } from '@/lib/checkout-session';
import { buildOrigin, redirectEventNotice } from '@/lib/server-redirects';
import { analytics } from '@/lib/handlers';
import { log } from '@/lib/log';

/**
 * Buyer-facing season-pass actions (ADR 0037): purchase a pass (destination
 * charge to the host, exactly like a ticket) and redeem a credit to claim a
 * spot on an eligible open-play event (no charge — prepaid). Redemption goes
 * through the `redeem_pass_credit` SECURITY DEFINER RPC, which reserves the
 * `event_participants` row atomically (capacity trigger fires) and consumes one
 * credit.
 */

function back(eventId: string, code: string, msg?: string): never {
  redirectEventNotice(eventId, 'rsvp', code, msg);
}

/**
 * Buy one of a host's passes. The buyer pays the pass price; PickupVB's
 * platform fee (host's tier) is taken as `application_fee_amount` from the
 * destination charge (the host absorbs it — they set the sticker price). The
 * pending `pass_purchases` row is written on the admin client (authoritative
 * snapshot); the webhook flips it to paid + stamps expiry. `eventId` is the
 * event the buyer is on — used only to bounce them back so they can redeem.
 */
export async function startPassPurchaseCheckout(
  passId: string,
  eventId: string,
  _formData: FormData,
): Promise<void> {
  if (!isStripeConfigured()) back(eventId, 'payments_off');
  const { user } = await requireRealUser(`/events/${eventId}`);

  const pass = await getHostPass(passId);
  if (!pass || pass.status !== 'active')
    back(eventId, 'error', 'That pass is no longer available.');
  if (pass.priceCents <= 0) back(eventId, 'error', 'That pass is misconfigured.');

  const hostAccountId = await getHostStripeAccount(pass.hostId);
  if (!hostAccountId) back(eventId, 'host_not_ready');

  const applicationFee = await platformFeeCentsFor(pass.hostId, pass.priceCents);

  // Authoritative pending purchase row (admin client — writes are admin-only on
  // pass_purchases). The webhook re-derives credits/expiry from the pass at
  // completion, so this row can't be tampered into more credits.
  const admin = getAdminSupabase();
  const { data: inserted, error: insErr } = await admin
    .from('pass_purchases')
    .insert({
      pass_id: pass.id,
      host_id: pass.hostId,
      buyer_user_id: user.id,
      title_snapshot: pass.title,
      credits_total: pass.creditCount,
      price_cents: pass.priceCents,
      payment_status: 'pending',
    })
    .select('id')
    .maybeSingle();
  if (insErr || !inserted) {
    await log.error('[pass] pending purchase insert failed', insErr, { passId });
    back(eventId, 'error', 'Could not start checkout.');
  }
  const purchaseId = (inserted as { id: string }).id;

  const origin = await buildOrigin();
  let session: Stripe.Checkout.Session;
  try {
    session = await createDestinationCheckoutSession({
      destinationAccountId: hostAccountId!,
      applicationFeeAmount: applicationFee,
      customerEmail: user.email ?? null,
      lineItems: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: pass.priceCents,
            product_data: {
              name: pass.title,
              description: `${pass.creditCount}-session pass`,
            },
          },
        },
      ],
      // Back to the event on success — the PassPanel then shows the new credit
      // balance + a "Use a pass credit" button, which is the confirmation +
      // next action. (No flash code: the open-play rsvp-result maps don't carry
      // a pass-purchase message, and an unknown code would render nothing.)
      successUrl: `${origin}/events/${eventId}`,
      cancelUrl: `${origin}/events/${eventId}`,
      metadata: {
        kind: 'pass_purchase',
        purchase_id: purchaseId,
        pass_id: pass.id,
        host_id: pass.hostId,
        user_id: user.id,
      },
      // One pending purchase row → at most one Checkout Session (TPI-5).
      idempotencyKey: `pass:${purchaseId}`,
    });
  } catch (err) {
    // Roll back the pending purchase so we don't leak an unpaid row.
    await admin.from('pass_purchases').delete().eq('id', purchaseId);
    await log.error('[pass] checkout session create failed', err, { passId, purchaseId });
    back(eventId, 'error', err instanceof Error ? err.message : 'Could not start checkout.');
  }

  await admin
    .from('pass_purchases')
    .update({ checkout_session_id: session.id })
    .eq('id', purchaseId);

  if (!session.url) back(eventId, 'error', 'Stripe did not return a checkout URL.');

  analytics.capture(
    {
      name: 'checkout_started',
      props: {
        eventId,
        hostId: pass.hostId,
        amountCents: pass.priceCents,
        kind: 'pass_purchase',
      },
    },
    user.id,
  );

  redirect(session.url as Route);
}

/**
 * Redeem one credit from `purchaseId` to claim a spot on `eventId`. The page
 * resolves the buyer's best redeemable purchase and binds it here. All the
 * eligibility / capacity / overdraft checks happen atomically in the RPC; we
 * just translate its errors to the event's `?rsvp=` flash channel.
 */
export async function redeemPassCredit(
  purchaseId: string,
  eventId: string,
  _formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(`/events/${eventId}`);
  const sb = await getServerSupabase();

  const { error } = await sb.rpc('redeem_pass_credit', {
    p_purchase_id: purchaseId,
    p_event_id: eventId,
  });

  if (error) {
    const m = (error.message || '').toLowerCase();
    if (m.includes('full')) back(eventId, 'full');
    if (m.includes('already_joined')) back(eventId, 'already');
    if (m.includes('no_credits')) back(eventId, 'error', 'No pass credits remaining.');
    if (m.includes('purchase_expired')) back(eventId, 'error', 'Your pass has expired.');
    if (m.includes('event_not_pass_eligible') || m.includes('event_not_open_play')) {
      back(eventId, 'error', 'This event does not accept pass credits.');
    }
    if (m.includes('event_host_mismatch')) {
      back(eventId, 'error', 'That pass is for a different host.');
    }
    await log.error('[pass] redeem failed', error, { eventId, purchaseId, userId: user.id });
    back(eventId, 'error', 'Could not redeem your pass credit.');
  }

  revalidatePath(`/events/${eventId}`);
  back(eventId, 'joined');
}
