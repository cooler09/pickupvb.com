'use server';

import { redirect } from 'next/navigation';
import type Stripe from 'stripe';
import type { Route } from 'next';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import {
    getEventPricing,
    attendeeChargeBreakdownAsync,
    platformFeeCentsFor,
} from '@/lib/event-pricing';
import { getHostStripeAccount } from '@/lib/host-stripe-account';
import { buildOrigin, redirectEventNotice } from '@/lib/server-redirects';
import { field } from '@/lib/form-data';
import { log } from '@/lib/log';

function backWithError(eventId: string, code: string, msg?: string): never {
    redirectEventNotice(eventId, 'rsvp', code, msg);
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
    // Anonymous auth users CAN buy tickets; we just need them to have an
    // auth session. The guest form (→ startGuestTicketCheckout) mints one.

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

    const breakdown = await attendeeChargeBreakdownAsync(pricing);

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
                    // The platform's actual take (Pro hosts get 2.5%, others
                    // 5%). Stripe pulls this out of the host's payout
                    // regardless of who pays the fee at checkout.
                    application_fee_amount: await platformFeeCentsFor(
                        pricing.hostId,
                        pricing.priceCents,
                    ),
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
 * Anonymous (guest) buys a ticket.
 *
 * Anonymous purchasers go through Supabase anonymous auth (per the
 * 20260513001100_anon_auth_pivot migration). We collect a display name +
 * email, mint an anon auth user (or reuse an existing one from cookies),
 * sync the profile, then fall through to the same attendee-based checkout
 * flow as authenticated users.
 */
export async function startGuestTicketCheckout(
    eventId: string,
    formData: FormData,
): Promise<void> {
    if (!isStripeConfigured()) backWithError(eventId, 'error', 'Payments are not configured.');

    const displayName = field(formData, 'display_name');
    const email = field(formData, 'email').toLowerCase();
    if (!displayName) backWithError(eventId, 'error', 'Please enter your name.');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        backWithError(eventId, 'error', 'A valid email is required for paid signups.');
    }

    const supabase = await getServerSupabase();
    const {
        data: { user: existing },
    } = await supabase.auth.getUser();

    if (!existing) {
        const { error: anonErr } = await supabase.auth.signInAnonymously({
            options: { data: { display_name: displayName } },
        });
        if (anonErr) {
            await log.error('[checkout/guest] anon sign-in failed', anonErr, { eventId });
            backWithError(eventId, 'error', 'Could not start a guest session.');
        }
    }

    // Sync display name onto profile (best-effort).
    const { data: { user: signedInUser } } = await supabase.auth.getUser();
    if (signedInUser) {
        await supabase
            .from('profiles')
            .update({ display_name: displayName } as never)
            .eq('id', signedInUser.id);
        // Attach email so the receipt + future claim flow have it. Don't fail
        // if Supabase rejects it (e.g. address already belongs to another user).
        const { error: emailErr } = await supabase.auth.updateUser({ email });
        if (emailErr && !/already.*registered/i.test(emailErr.message)) {
            log.warn('[checkout/guest] email update failed', { error: emailErr.message });
        }
    }

    // Hand off to the unified attendee checkout. Anon users are allowed.
    await startTicketCheckout(eventId);
}
