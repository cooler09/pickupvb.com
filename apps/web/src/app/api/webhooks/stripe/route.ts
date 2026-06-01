import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { log } from '@/lib/log';
import { handleAccountUpdated, handlePayoutPaid } from '@/lib/webhooks/connect';
import { handleCheckoutCompleted, handleCheckoutExpired } from '@/lib/webhooks/checkout';
import { handleChargeRefunded, handlePaymentFailed } from '@/lib/webhooks/charge';
import { handleSubscriptionChange } from '@/lib/webhooks/subscription';
import { decideWebhookProcessing } from '@/lib/webhooks/idempotency';

/**
 * Stripe webhook receiver.
 *
 * Stripe POSTs JSON events here. We:
 *   1. Verify the signature using `STRIPE_WEBHOOK_SECRET`.
 *   2. Insert the event id into `stripe_webhook_events` to dedupe redeliveries
 *      (Stripe retries up to 3 days). A unique violation means we've already
 *      processed this event — return 200 immediately.
 *   3. Dispatch to a per-type handler (in `@/lib/webhooks/*`). Each handler is
 *      responsible for its own idempotency at the data layer (e.g. don't
 *      double-credit an attendee).
 *   4. Mark `processed_at` so the log is queryable for incident response.
 *
 * Invariants:
 *   - This endpoint MUST be reachable without authentication.
 *   - It MUST return 200 within Stripe's 30s budget. If processing takes
 *     longer, queue work and return early. (Today every handler is fast.)
 *   - It MUST NOT return 5xx for "expected" failures (signature mismatch,
 *     unknown event type) — those are 4xx so Stripe doesn't retry forever.
 *
 * The per-type handlers were extracted to `@/lib/webhooks/` (architecture audit
 * P3-2); this route is the signature/idempotency boundary + dispatch switch.
 */

// Body must be the raw text — signature verification needs byte-exact input.
export const dynamic = 'force-dynamic';
// Edge runtime can't access node `crypto` Stripe needs; keep on Node.
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'STRIPE_NOT_CONFIGURED' }, { status: 503 });
  }
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
  if (!webhookSecret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET_MISSING' }, { status: 503 });
  }

  const sig = (await headers()).get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'MISSING_SIGNATURE' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    // Bad signature — bail with 400 so Stripe stops retrying.
    await log.error('[stripe-webhook] signature verification failed', err);
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
  }

  // Idempotency: upsert with `ignoreDuplicates`. On first sight the row is
  // inserted and `.select()` returns it; on a redelivery the unique
  // constraint on `id` short-circuits Postgres' insert path without raising
  // an exception, so `.select()` returns an empty array. Cheaper than the
  // previous insert-and-catch (`23505`) pattern by ~5–20 ms per retry —
  // see performance audit P2 #9.
  const admin = getAdminSupabase();
  const { data: insertedRows, error: insertErr } = await admin
    .from('stripe_webhook_events')
    .upsert({ id: event.id, event_type: event.type } as never, {
      onConflict: 'id',
      ignoreDuplicates: true,
    })
    .select('id');
  if (insertErr) {
    await log.error('[stripe-webhook] insert log failed', insertErr, {
      eventId: event.id,
      eventType: event.type,
    });
    // Return 500 so Stripe retries; we'd rather process twice than not at
    // all (downstream handlers are idempotent).
    return NextResponse.json({ error: 'LOG_FAILED' }, { status: 500 });
  }

  // Dedupe on `processed_at`, not mere row existence (TPI-6): a row stuck at
  // `processed_at IS NULL` is an earlier attempt that crashed between this claim
  // and the handler completing — re-drive it instead of losing the event.
  const insertedNew = Boolean(insertedRows && insertedRows.length > 0);
  let existingProcessedAt: string | null = null;
  if (!insertedNew) {
    const { data: existing } = await admin
      .from('stripe_webhook_events')
      .select('processed_at')
      .eq('id', event.id)
      .single();
    existingProcessedAt =
      (existing as { processed_at: string | null } | null)?.processed_at ?? null;
  }
  if (decideWebhookProcessing(insertedNew, existingProcessedAt) === 'deduped') {
    // Already fully processed — return 200 so Stripe stops retrying.
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    await dispatch(event);
  } catch (err) {
    await log.error('[stripe-webhook] handler threw', err, {
      eventId: event.id,
      eventType: event.type,
    });
    // Delete the claim row so Stripe's retry re-drives promptly. Even if this
    // delete itself fails (the orphan case), the row stays at
    // `processed_at IS NULL` and the next retry re-drives it anyway (TPI-6).
    await admin.from('stripe_webhook_events').delete().eq('id', event.id);
    return NextResponse.json({ error: 'HANDLER_FAILED' }, { status: 500 });
  }

  await admin
    .from('stripe_webhook_events')
    .update({ processed_at: new Date().toISOString() } as never)
    .eq('id', event.id);

  return NextResponse.json({ ok: true });
}

/**
 * Per-type dispatch. Throw to signal a retryable failure; return cleanly to
 * mark processed. Unknown events are no-ops (Stripe sends a lot we don't
 * subscribe to, depending on dashboard configuration).
 */
async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'account.updated':
      await handleAccountUpdated(event.data.object as Stripe.Account);
      return;
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case 'checkout.session.expired':
      await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
      return;
    case 'charge.refunded':
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      return;
    case 'payout.paid':
      await handlePayoutPaid(event.data.object as Stripe.Payout, event.account ?? null);
      return;
    case 'payment_intent.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
      return;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionChange(
        event.data.object as Stripe.Subscription,
        event.type,
        (event.data as { previous_attributes?: Partial<Stripe.Subscription> }).previous_attributes,
      );
      return;
    default:
      // No-op for events we don't subscribe to. Returning here marks
      // them as processed in our log; that's fine.
      return;
  }
}
