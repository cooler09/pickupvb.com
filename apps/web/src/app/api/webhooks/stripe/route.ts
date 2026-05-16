import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { log } from '@/lib/log';

/**
 * Stripe webhook receiver.
 *
 * Stripe POSTs JSON events here. We:
 *   1. Verify the signature using `STRIPE_WEBHOOK_SECRET`.
 *   2. Insert the event id into `stripe_webhook_events` to dedupe redeliveries
 *      (Stripe retries up to 3 days). A unique violation means we've already
 *      processed this event — return 200 immediately.
 *   3. Dispatch to a per-type handler. Each handler is responsible for its own
 *      idempotency at the data layer (e.g. don't double-credit an attendee).
 *   4. Mark `processed_at` so the log is queryable for incident response.
 *
 * Phase 1: only `account.updated` is handled (mirrors Stripe Connect
 * onboarding state into `host_stripe_accounts`). Phase 2 will add
 * `checkout.session.completed`, `charge.refunded`, etc.
 *
 * Phase 1 invariants:
 *   - This endpoint MUST be reachable without authentication.
 *   - It MUST return 200 within Stripe's 30s budget. If processing takes
 *     longer, queue work and return early. (Today every handler is fast.)
 *   - It MUST NOT return 5xx for "expected" failures (signature mismatch,
 *     unknown event type) — those are 4xx so Stripe doesn't retry forever.
 */

// Body must be the raw text — signature verification needs byte-exact input.
export const dynamic = 'force-dynamic';
// Edge runtime can't access node `crypto` Stripe needs; keep on Node.
export const runtime = 'nodejs';

export async function POST(request: Request) {
    if (!isStripeConfigured()) {
        return NextResponse.json(
            { error: 'STRIPE_NOT_CONFIGURED' },
            { status: 503 },
        );
    }
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
    if (!webhookSecret) {
        return NextResponse.json(
            { error: 'STRIPE_WEBHOOK_SECRET_MISSING' },
            { status: 503 },
        );
    }

    const sig = (await headers()).get('stripe-signature');
    if (!sig) {
        return NextResponse.json(
            { error: 'MISSING_SIGNATURE' },
            { status: 400 },
        );
    }

    const rawBody = await request.text();

    let event: Stripe.Event;
    try {
        event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
        // Bad signature — bail with 400 so Stripe stops retrying.
        await log.error('[stripe-webhook] signature verification failed', err);
        return NextResponse.json(
            { error: 'INVALID_SIGNATURE' },
            { status: 400 },
        );
    }

    // Idempotency: insert-and-check. Unique-violation on `id` means we've
    // already processed this event id. Return 200 so Stripe stops retrying.
    const admin = getAdminSupabase();
    const { error: insertErr } = await admin
        .from('stripe_webhook_events')
        .insert({ id: event.id, event_type: event.type } as never);
    if (insertErr) {
        // 23505 = unique_violation. Treat as "already processed".
        if (insertErr.code === '23505') {
            return NextResponse.json({ ok: true, deduped: true });
        }
        await log.error('[stripe-webhook] insert log failed', insertErr, {
            eventId: event.id,
            eventType: event.type,
        });
        // Return 500 so Stripe retries; we'd rather process twice than not at
        // all (downstream handlers are idempotent).
        return NextResponse.json({ error: 'LOG_FAILED' }, { status: 500 });
    }

    try {
        await dispatch(event);
    } catch (err) {
        await log.error('[stripe-webhook] handler threw', err, {
            eventId: event.id,
            eventType: event.type,
        });
        // Don't mark processed_at — Stripe will retry, we'll dedupe via
        // unique key on next attempt only AFTER... wait, we already inserted.
        // Delete the log row so the retry isn't deduped.
        await admin
            .from('stripe_webhook_events')
            .delete()
            .eq('id', event.id);
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
        case 'payment_intent.payment_failed':
            await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
            return;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
            await handleSubscriptionChange(event.data.object as Stripe.Subscription);
            return;
        default:
            // No-op for events we don't subscribe to. Returning here marks
            // them as processed in our log; that's fine.
            return;
    }
}

/**
 * Mirror Stripe Connect account state into our `host_stripe_accounts` table.
 * Fired by Stripe whenever the account changes (KYC submission, capability
 * grants, requirements added/removed). The fields we care about let us
 * gate the "publish a paid event" UI.
 */
async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
    const admin = getAdminSupabase();
    const { error } = await admin
        .from('host_stripe_accounts')
        .update({
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled,
            details_submitted: account.details_submitted,
            last_event_payload: account as unknown as Record<string, unknown>,
        } as never)
        .eq('stripe_account_id', account.id);
    if (error) {
        // If the row doesn't exist yet (host hasn't started onboarding via
        // our flow), there's nothing to update. That's fine.
        if (error.code === 'PGRST116') return;
        throw new Error(`account.updated mirror failed: ${error.message}`);
    }
}

// ============================================================================
// Ticketed-event handlers (Phase 2)
// ============================================================================

type CheckoutMetadata = {
    event_id?: string;
    user_id?: string;
    kind?: 'attendee';
};

/**
 * Customer completed payment. Find the reservation row by checkout_session_id
 * (or by metadata as fallback) and flip it to `paid`. Audit-log the event.
 */
async function handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
): Promise<void> {
    const meta = (session.metadata ?? {}) as CheckoutMetadata;
    if (!meta.event_id || !meta.kind) return;

    const admin = getAdminSupabase();
    const paidAt = new Date().toISOString();
    const piId =
        typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null;
    const amountTotal = session.amount_total ?? 0;

    if (meta.kind === 'attendee' && meta.user_id) {
        const { error } = await admin
            .from('event_attendees')
            .update({
                payment_status: 'paid',
                payment_intent_id: piId,
                amount_paid_cents: amountTotal,
                paid_at: paidAt,
            } as never)
            .eq('event_id', meta.event_id)
            .eq('user_id', meta.user_id);
        if (error) throw new Error(`mark attendee paid failed: ${error.message}`);

        await admin.from('event_payment_audit').insert({
            event_id: meta.event_id,
            user_id: meta.user_id,
            action: 'paid',
            amount_cents: amountTotal,
            payment_intent_id: piId,
        } as never);
    }
}

/**
 * Checkout session expired (30-min default) without a successful payment.
 * Drop the pending reservation so the spot opens back up.
 */
async function handleCheckoutExpired(
    session: Stripe.Checkout.Session,
): Promise<void> {
    const meta = (session.metadata ?? {}) as CheckoutMetadata;
    if (!meta.event_id || !meta.kind) return;
    const admin = getAdminSupabase();

    if (meta.kind === 'attendee' && meta.user_id) {
        await admin
            .from('event_attendees')
            .delete()
            .eq('event_id', meta.event_id)
            .eq('user_id', meta.user_id)
            .eq('payment_status', 'pending');
    }
}

/**
 * Same cleanup as expired — bare payment_intent.payment_failed events fire
 * when the customer's card declines mid-checkout. We don't always get a
 * matching session here (Stripe sends both), but cleanup is idempotent.
 */
async function handlePaymentFailed(pi: Stripe.PaymentIntent): Promise<void> {
    const admin = getAdminSupabase();
    await admin
        .from('event_attendees')
        .delete()
        .eq('payment_intent_id', pi.id)
        .eq('payment_status', 'pending');
}

/**
 * Refund issued (manual via Stripe dashboard, or programmatic from a future
 * leave-and-refund action). Mark the row refunded AND delete it so capacity
 * re-opens. Audit-log it.
 */
async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const piId =
        typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id ?? null;
    if (!piId) return;

    const admin = getAdminSupabase();

    const { data: attendeeRow } = await admin
        .from('event_attendees')
        .select('event_id, user_id, amount_paid_cents')
        .eq('payment_intent_id', piId)
        .maybeSingle();
    type AttRow = { event_id: string; user_id: string; amount_paid_cents: number };
    const att = attendeeRow as unknown as AttRow | null;
    if (att) {
        await admin
            .from('event_attendees')
            .delete()
            .eq('event_id', att.event_id)
            .eq('user_id', att.user_id);
        await admin.from('event_payment_audit').insert({
            event_id: att.event_id,
            user_id: att.user_id,
            action: 'refunded',
            amount_cents: charge.amount_refunded ?? att.amount_paid_cents,
            payment_intent_id: piId,
        } as never);
    }
}

// ============================================================================
// Pro Host subscription handlers (Phase 3)
// ============================================================================

/**
 * Keep host_subscriptions in sync with Stripe. Fires on create/update/delete
 * so a single handler covers trial start, payment success, cancellation,
 * past_due, and end-of-period cancel.
 */
async function handleSubscriptionChange(sub: Stripe.Subscription): Promise<void> {
    const admin = getAdminSupabase();

    const customerId =
        typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

    // Resolve user_id: prefer subscription metadata, then customer metadata,
    // then fall back to our existing row keyed by customer id.
    let userId =
        (sub.metadata?.['user_id'] as string | undefined) ?? undefined;
    if (!userId && typeof sub.customer !== 'string' && !sub.customer.deleted) {
        userId = (sub.customer.metadata?.['user_id'] as string | undefined) ?? undefined;
    }
    if (!userId) {
        type Row = { user_id: string };
        const { data } = await admin
            .from('host_subscriptions')
            .select('user_id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
        userId = (data as Row | null)?.user_id;
    }
    if (!userId) {
        await log.error('[stripe-webhook] subscription change: no user_id resolvable', null, {
            subscriptionId: sub.id,
            customerId,
        });
        return;
    }

    // Derive plan from the first item's price id.
    const priceId = sub.items.data[0]?.price.id ?? null;
    const plan =
        priceId === process.env['STRIPE_PRO_YEARLY_PRICE_ID']
            ? 'yearly'
            : priceId === process.env['STRIPE_PRO_MONTHLY_PRICE_ID']
                ? 'monthly'
                : null;

    const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
    const trialEnd = sub.trial_end;

    const { error } = await admin
        .from('host_subscriptions')
        .upsert(
            {
                user_id: userId,
                stripe_customer_id: customerId,
                stripe_subscription_id: sub.id,
                status: sub.status,
                plan,
                current_period_end: periodEnd
                    ? new Date(periodEnd * 1000).toISOString()
                    : null,
                trial_end: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
                cancel_at_period_end: sub.cancel_at_period_end ?? false,
                updated_at: new Date().toISOString(),
            } as never,
            { onConflict: 'user_id' },
        );
    if (error) {
        throw new Error(`subscription upsert failed: ${error.message}`);
    }
}
