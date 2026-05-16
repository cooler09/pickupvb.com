'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import type { Route } from 'next';
import { getStripe, isStripeConfigured, platformFeeCents } from '@/lib/stripe';
import { isPro, PRO_PLATFORM_FEE_BPS } from '@/lib/pro';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { field } from '@/lib/form-data';
import { log } from '@/lib/log';
import { MIN_TIP_CENTS, MAX_TIP_CENTS } from './tip-constants';

/** Pro-aware platform cut on a tip, in cents. */
async function platformCutCents(hostId: string, amountCents: number): Promise<number> {
    if (await isPro(hostId)) {
        return Math.round((amountCents * PRO_PLATFORM_FEE_BPS) / 10_000);
    }
    return platformFeeCents(amountCents);
}

function backWithError(eventId: string, code: string, msg?: string): never {
    const params = new URLSearchParams({ tip: code });
    if (msg) params.set('tip_msg', msg);
    redirect(`/events/${eventId}?${params.toString()}`);
}

async function buildOrigin(): Promise<string> {
    const h = await headers();
    return (
        h.get('origin') ??
        (h.get('host') ? `https://${h.get('host')}` : 'http://localhost:3000')
    );
}

function parseAmountCents(raw: string): number | null {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const cents = Math.round(n * 100);
    if (cents < MIN_TIP_CENTS || cents > MAX_TIP_CENTS) return null;
    return cents;
}

type EventLite = {
    id: string;
    host_id: string;
    title: string;
};

async function loadEvent(eventId: string): Promise<EventLite | null> {
    const admin = getAdminSupabase();
    const { data } = await admin
        .from('events')
        .select('id, host_id, title')
        .eq('id', eventId)
        .maybeSingle();
    return (data as EventLite | null) ?? null;
}

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

/**
 * Send a tip to the event host. Works for any event (free or paid). Tipping
 * is opt-in by the user and never required.
 *
 * Authenticated (incl. anon-auth) users only — the calling form mints an
 * anonymous Supabase session first via the guest flow if needed.
 */
export async function startTipCheckout(
    eventId: string,
    formData: FormData,
): Promise<void> {
    if (!isStripeConfigured()) backWithError(eventId, 'error', 'Payments are not configured.');

    const amountCents = parseAmountCents(field(formData, 'amount'));
    if (amountCents === null) {
        backWithError(eventId, 'error', `Tip must be between $${MIN_TIP_CENTS / 100} and $${MAX_TIP_CENTS / 100}.`);
    }
    const message = field(formData, 'message').slice(0, 280) || null;

    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) backWithError(eventId, 'signin');

    const event = await loadEvent(eventId);
    if (!event) backWithError(eventId, 'error', 'Event not found.');
    if (event.host_id === user.id) backWithError(eventId, 'error', "You can't tip your own event.");

    const hostAccountId = await getHostStripeAccount(event.host_id);
    if (!hostAccountId) backWithError(eventId, 'error', 'Host has not finished payment setup.');

    // Look up tipper display name for the public list.
    const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();
    const displayName = (profile as { display_name: string | null } | null)?.display_name ?? null;

    const platformCut = await platformCutCents(event.host_id, amountCents!);

    // Insert pending tip row up front so the webhook can match by session id.
    const admin = getAdminSupabase();
    const { data: inserted, error: insertErr } = await admin
        .from('event_tips')
        .insert({
            event_id: eventId,
            host_id: event.host_id,
            tipper_user_id: user.id,
            tipper_display_name: displayName,
            amount_cents: amountCents,
            platform_fee_cents: platformCut,
            message,
            status: 'pending',
        } as never)
        .select('id')
        .single();
    if (insertErr || !inserted) {
        await log.error('[tip] insert pending failed', insertErr, { eventId });
        backWithError(eventId, 'error', insertErr?.message ?? 'Could not start tip.');
    }
    const tipId = (inserted as { id: string }).id;

    const origin = await buildOrigin();
    const stripe = getStripe();

    let session: Stripe.Checkout.Session;
    try {
        session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            ...(user.email ? { customer_email: user.email } : {}),
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: 'usd',
                        unit_amount: amountCents!,
                        product_data: {
                            name: `Tip — ${event.title}`,
                            ...(message ? { description: message } : {}),
                        },
                    },
                },
            ],
            payment_intent_data: {
                application_fee_amount: platformCut,
                transfer_data: { destination: hostAccountId! },
            },
            success_url: `${origin}/events/${eventId}?tip=thanks`,
            cancel_url: `${origin}/events/${eventId}?tip=cancel`,
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
            metadata: {
                kind: 'tip',
                event_id: eventId,
                host_id: event.host_id,
                user_id: user.id,
                tip_id: tipId,
            },
        });
    } catch (err) {
        // Roll back the pending row.
        await admin.from('event_tips').delete().eq('id', tipId);
        await log.error('[tip] session create failed', err, { eventId });
        const m = err instanceof Error ? err.message : 'Could not start tip checkout.';
        backWithError(eventId, 'error', m);
    }

    await admin
        .from('event_tips')
        .update({ stripe_session_id: session.id } as never)
        .eq('id', tipId);

    if (!session.url) backWithError(eventId, 'error', 'Stripe did not return a URL.');
    redirect(session.url as Route);
}

/**
 * Guest variant — mints an anonymous Supabase session first (same pattern
 * as guest ticket purchase), then delegates to startTipCheckout.
 */
export async function startGuestTipCheckout(
    eventId: string,
    formData: FormData,
): Promise<void> {
    const displayName = field(formData, 'display_name');
    const turnstileToken = field(formData, 'cf-turnstile-response');

    if (displayName.length < 1 || displayName.length > 80) {
        backWithError(eventId, 'error', 'Name is required (1–80 characters).');
    }
    const turnstile = await verifyTurnstileToken(turnstileToken || null);
    if (!turnstile.ok) backWithError(eventId, 'error', turnstile.error ?? 'Verification failed.');

    const supabase = await getServerSupabase();
    const {
        data: { user: existing },
    } = await supabase.auth.getUser();

    if (!existing) {
        const { data, error } = await supabase.auth.signInAnonymously({
            options: { data: { display_name: displayName } },
        });
        if (error || !data.user) {
            backWithError(
                eventId,
                'error',
                error?.message ?? 'Could not start a guest session.',
            );
        }
    }

    // Persist chosen name onto profile so it shows on the public tip list.
    const userId = existing?.id ?? (await supabase.auth.getUser()).data.user?.id;
    if (userId) {
        await supabase
            .from('profiles')
            .update({ display_name: displayName } as never)
            .eq('id', userId);
    }

    await startTipCheckout(eventId, formData);
}
