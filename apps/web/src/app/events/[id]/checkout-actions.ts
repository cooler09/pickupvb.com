'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import type { Route } from 'next';
import { getStripe, isStripeConfigured, platformFeeCents } from '@/lib/stripe';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { getEventPricing, attendeeChargeBreakdown } from '@/lib/event-pricing';
import { log } from '@/lib/log';

/**
 * Resolve the host's Stripe Connect account id. Returns null if the host
 * isn't set up to receive payments yet (in which case the calling action
 * should error out — paid events shouldn't have been publishable in the
 * first place; this is defense in depth).
 */
async function getHostStripeAccount(hostId: string): Promise<string | null> {
    const admin = getAdminSupabase();
    const { data } = await admin
        .from('host_stripe_accounts')
        .select('stripe_account_id, charges_enabled')
        .eq('user_id', hostId)
        .maybeSingle();
    type Row = { stripe_account_id: string; charges_enabled: boolean };
    const row = data as unknown as Row | null;
    if (!row || !row.charges_enabled) return null;
    return row.stripe_account_id;
}

function backWithError(eventId: string, code: string, msg?: string): never {
    const params = new URLSearchParams({ rsvp: code });
    if (msg) params.set('rsvp_msg', msg);
    redirect(`/events/${eventId}?${params.toString()}`);
}

async function buildOrigin(): Promise<string> {
    const h = await headers();
    return (
        h.get('origin') ??
        (h.get('host') ? `https://${h.get('host')}` : 'http://localhost:3000')
    );
}

/**
 * Authenticated user is buying a ticket.
 *
 * Flow:
 * 1. Resolve viewer + pricing.
 * 2. Insert a `pending` event_attendees row (capacity trigger reserves the
 *    spot atomically — if the event is full this throws and we bail).
 * 3. Create a Stripe Checkout Session with metadata pointing at the row.
 * 4. Redirect to Stripe.
 *
 * The webhook (`checkout.session.completed`) flips the row to `paid`, or
 * deletes it on `checkout.session.expired` / payment_failed.
 */
export async function startTicketCheckout(eventId: string): Promise<void> {
    if (!isStripeConfigured()) backWithError(eventId, 'error', 'Payments are not configured.');

    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) backWithError(eventId, 'signin');
    if ((user as { is_anonymous?: boolean }).is_anonymous) {
        backWithError(eventId, 'anon');
    }

    const pricing = await getEventPricing(eventId);
    if (!pricing) backWithError(eventId, 'error', 'Event not found.');
    if (pricing.priceCents <= 0) {
        // Free event — caller should have used joinEvent. Just bounce them.
        backWithError(eventId, 'error', 'This is a free event.');
    }

    const hostAccountId = await getHostStripeAccount(pricing.hostId);
    if (!hostAccountId) {
        backWithError(eventId, 'error', 'Host has not finished payment setup.');
    }

    const breakdown = attendeeChargeBreakdown(pricing);

    // Reserve the spot atomically. The capacity trigger raises if full.
    // 23505 (unique violation on PK) means the user already has a row;
    // could be from a previous checkout that didn't complete.
    const admin = getAdminSupabase();
    const { error: insertErr } = await admin
        .from('event_attendees')
        .insert({
            event_id: eventId,
            user_id: user.id,
            payment_status: 'pending',
            amount_paid_cents: 0,
        } as never);
    if (insertErr) {
        // Reuse the existing row if any (idempotent retry of a prior
        // checkout). For other errors, surface a friendly message.
        if (insertErr.code === '23505') {
            // Already have a row. If they're already 'paid' bounce them, else
            // fall through and create a new checkout for the existing pending row.
            const { data: existing } = await admin
                .from('event_attendees')
                .select('payment_status')
                .eq('event_id', eventId)
                .eq('user_id', user.id)
                .maybeSingle();
            const status = (existing as { payment_status: string } | null)?.payment_status;
            if (status === 'paid') backWithError(eventId, 'already');
            // status === 'pending' or 'none' — proceed to (re)create checkout.
        } else if (insertErr.message?.toLowerCase().includes('full')) {
            backWithError(eventId, 'full');
        } else {
            await log.error('[checkout] reserve attendee failed', insertErr, { eventId });
            backWithError(eventId, 'error', insertErr.message);
        }
    }

    const origin = await buildOrigin();
    const stripe = getStripe();

    let session: Stripe.Checkout.Session;
    try {
        session = await stripe.checkout.sessions.create(
            {
                mode: 'payment',
                payment_method_types: ['card'],
                ...(user.email ? { customer_email: user.email } : {}),
                line_items: [
                    {
                        quantity: 1,
                        price_data: {
                            currency: 'usd',
                            unit_amount: breakdown.ticketCents,
                            product_data: { name: 'Event ticket' },
                        },
                    },
                    ...(breakdown.platformFeeCents > 0
                        ? [
                            {
                                quantity: 1,
                                price_data: {
                                    currency: 'usd' as const,
                                    unit_amount: breakdown.platformFeeCents,
                                    product_data: { name: 'Service fee' },
                                },
                            },
                        ]
                        : []),
                ],
                payment_intent_data: {
                    application_fee_amount: platformFeeCents(pricing.priceCents),
                    transfer_data: { destination: hostAccountId! },
                },
                success_url: `${origin}/events/${eventId}?rsvp=joined`,
                cancel_url: `${origin}/events/${eventId}?rsvp=cancel`,
                expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
                metadata: {
                    event_id: eventId,
                    user_id: user.id,
                    kind: 'attendee',
                },
            },
        );
    } catch (err) {
        // Roll back the pending row so we don't leak capacity.
        await admin
            .from('event_attendees')
            .delete()
            .eq('event_id', eventId)
            .eq('user_id', user.id)
            .eq('payment_status', 'pending');
        await log.error('[checkout] session create failed', err, { eventId });
        const m = err instanceof Error ? err.message : 'Could not start checkout.';
        backWithError(eventId, 'error', m);
    }

    // Stash the session id on the row so we can match the webhook later.
    await admin
        .from('event_attendees')
        .update({ checkout_session_id: session.id } as never)
        .eq('event_id', eventId)
        .eq('user_id', user.id);

    if (!session.url) backWithError(eventId, 'error', 'Stripe did not return a URL.');
    redirect(session.url as Route);
}

/**
 * Anonymous (guest) buys a ticket. Requires display name + email up front
 * (we collect them with a small form, like the existing free-guest flow).
 *
 * Implementation mirrors `startTicketCheckout` but inserts into
 * `event_guests` instead of `event_attendees`. The webhook routes by the
 * `kind` metadata.
 */
export async function startGuestTicketCheckout(
    eventId: string,
    formData: FormData,
): Promise<void> {
    if (!isStripeConfigured()) backWithError(eventId, 'error', 'Payments are not configured.');

    const displayName = String(formData.get('display_name') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    if (!displayName) backWithError(eventId, 'error', 'Please enter your name.');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        backWithError(eventId, 'error', 'A valid email is required for paid signups.');
    }

    const pricing = await getEventPricing(eventId);
    if (!pricing) backWithError(eventId, 'error', 'Event not found.');
    if (pricing.priceCents <= 0) backWithError(eventId, 'error', 'This is a free event.');

    const hostAccountId = await getHostStripeAccount(pricing.hostId);
    if (!hostAccountId) backWithError(eventId, 'error', 'Host has not finished payment setup.');

    const breakdown = attendeeChargeBreakdown(pricing);

    const admin = getAdminSupabase();
    const { data: insertData, error: insertErr } = await admin
        .from('event_guests')
        .insert({
            event_id: eventId,
            display_name: displayName,
            email,
            payment_status: 'pending',
            amount_paid_cents: 0,
        } as never)
        .select('id')
        .single();
    if (insertErr || !insertData) {
        if (insertErr?.code === '23505') {
            backWithError(eventId, 'error', 'A guest with that name is already signed up.');
        }
        if (insertErr?.message?.toLowerCase().includes('full')) {
            backWithError(eventId, 'full');
        }
        await log.error('[checkout/guest] reserve guest failed', insertErr, { eventId });
        backWithError(eventId, 'error', insertErr?.message ?? 'Could not start checkout.');
    }
    const guestId = (insertData as unknown as { id: string }).id;

    const origin = await buildOrigin();
    const stripe = getStripe();

    let session: Stripe.Checkout.Session;
    try {
        session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: email,
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: 'usd',
                        unit_amount: breakdown.ticketCents,
                        product_data: { name: 'Event ticket' },
                    },
                },
                ...(breakdown.platformFeeCents > 0
                    ? [
                        {
                            quantity: 1,
                            price_data: {
                                currency: 'usd' as const,
                                unit_amount: breakdown.platformFeeCents,
                                product_data: { name: 'Service fee' },
                            },
                        },
                    ]
                    : []),
            ],
            payment_intent_data: {
                application_fee_amount: platformFeeCents(pricing.priceCents),
                transfer_data: { destination: hostAccountId! },
            },
            success_url: `${origin}/events/${eventId}?rsvp=joined`,
            cancel_url: `${origin}/events/${eventId}?rsvp=cancel`,
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
            metadata: {
                event_id: eventId,
                guest_id: guestId,
                kind: 'guest',
            },
        });
    } catch (err) {
        await admin.from('event_guests').delete().eq('id', guestId);
        await log.error('[checkout/guest] session create failed', err, { eventId });
        const m = err instanceof Error ? err.message : 'Could not start checkout.';
        backWithError(eventId, 'error', m);
    }

    await admin
        .from('event_guests')
        .update({ checkout_session_id: session.id } as never)
        .eq('id', guestId);

    if (!session.url) backWithError(eventId, 'error', 'Stripe did not return a URL.');
    redirect(session.url as Route);
}
