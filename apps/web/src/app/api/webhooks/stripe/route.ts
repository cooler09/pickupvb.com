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
        // Phase 2 will add:
        //   case 'checkout.session.completed': ...
        //   case 'charge.refunded':            ...
        //   case 'payment_intent.payment_failed': ...
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
